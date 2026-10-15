import { mkdir, open, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LiveOp } from "@/lib/live/ops";
import { docKey, parseDocKey } from "@/lib/live/protocol";

/**
 * Each open plan's accepted batches since its last flush, one JSON line per
 * batch, written (and synced to disk) before the batch is broadcast. A flush
 * rewrites the file to what is still unflushed (usually nothing); on start
 * the service replays every file over the stored plans, so a crash between
 * flushes loses nothing.
 *
 * Files are named `<ownerId>.<designId>.jsonl` (a doc key's colon is not a
 * legal file name character everywhere).
 */

export interface JournalEntry {
  seq: number;
  cid: string;
  by: string;
  at: string;
  ops: LiveOp[];
}

export class Journal {
  /** One queue per doc: a doc's writes stay in order, docs never wait on each other. */
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(readonly dir: string) {}

  fileFor(doc: string): string {
    const key = parseDocKey(doc);
    if (!key) {
      throw new Error(`Not a doc key: ${doc}`);
    }
    return path.join(this.dir, `${key.ownerId}.${key.designId}.jsonl`);
  }

  /** Every doc with a journal on disk. */
  async docs(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const docs: string[] = [];
    for (const name of names) {
      const match = /^([0-9a-f-]{36})\.([A-Za-z0-9-]{8,64})\.jsonl$/i.exec(name);
      if (match) {
        docs.push(docKey(match[1]!.toLowerCase(), match[2]!));
      }
    }
    return docs;
  }

  /** The entries on disk for a doc, in order. A torn last line (a crash mid-write) is skipped. */
  async read(doc: string): Promise<JournalEntry[]> {
    let text: string;
    try {
      text = await readFile(this.fileFor(doc), "utf8");
    } catch {
      return [];
    }
    const entries: JournalEntry[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      try {
        const entry = JSON.parse(line) as JournalEntry;
        if (Number.isInteger(entry.seq) && Array.isArray(entry.ops)) {
          entries.push(entry);
        }
      } catch {
        // A partial line: the batch was never acknowledged.
      }
    }
    return entries;
  }

  /** Appends one entry and syncs it to disk. A doc's calls run in order. */
  append(doc: string, entry: JournalEntry): Promise<void> {
    return this.serial(doc, async () => {
      await mkdir(this.dir, { recursive: true });
      const handle = await open(this.fileFor(doc), "a");
      try {
        await handle.write(`${JSON.stringify(entry)}\n`);
        await handle.datasync();
      } finally {
        await handle.close();
      }
    });
  }

  /** Keeps only the entries after `seq` (a flush reached it): usually removes the file. */
  trim(doc: string, seq: number): Promise<void> {
    return this.serial(doc, async () => {
      const rest = (await this.read(doc)).filter((entry) => entry.seq > seq);
      if (rest.length === 0) {
        await rm(this.fileFor(doc), { force: true });
      } else {
        await writeFile(
          this.fileFor(doc),
          rest.map((entry) => `${JSON.stringify(entry)}\n`).join(""),
        );
      }
    });
  }

  /** Forgets a doc's journal (the plan was deleted). */
  remove(doc: string): Promise<void> {
    return this.serial(doc, () => rm(this.fileFor(doc), { force: true }));
  }

  private serial<T>(doc: string, work: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(doc) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.catch(() => undefined);
    this.chains.set(doc, settled);
    void settled.then(() => {
      if (this.chains.get(doc) === settled) {
        this.chains.delete(doc);
      }
    });
    return next;
  }
}
