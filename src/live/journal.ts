import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
 * Writes are grouped: the lines a doc gets within one turn of the event loop,
 * and all that arrive while its last write is still on the disk, go in one
 * write and one sync (a group commit). A busy plan syncs once per write's
 * time, not once per batch.
 *
 * Files are named `<ownerId>.<designId>.jsonl` (a doc key's colon is not a
 * legal file name character everywhere).
 *
 * Beside each journal, `<ownerId>.<designId>.cids.json` keeps the room's most
 * recently applied batch ids with their seqs, written by every trim before
 * the entries go. A batch resent after a restart whose journal was already
 * flushed is then still known, and is acknowledged rather than applied twice.
 */

/** A batch id and the seq it was applied as. */
export type AppliedCid = [cid: string, seq: number];

export interface JournalEntry {
  seq: number;
  cid: string;
  by: string;
  at: string;
  ops: LiveOp[];
}

interface WaitingLine {
  text: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export class Journal {
  /** One queue per doc: a doc's writes stay in order, docs never wait on each other. */
  private readonly chains = new Map<string, Promise<unknown>>();
  /** Each doc's lines waiting for its next group write. */
  private readonly waiting = new Map<string, WaitingLine[]>();
  /** Docs with a group write coming or on its way. */
  private readonly writing = new Set<string>();
  /** Each doc's last line's promise: everything appended so far is on disk when it settles. */
  private readonly last = new Map<string, Promise<void>>();
  /** Group writes made (each one write and one sync), for tests and the health check. */
  writes = 0;

  constructor(readonly dir: string) {}

  fileFor(doc: string): string {
    const key = parseDocKey(doc);
    if (!key) {
      throw new Error(`Not a doc key: ${doc}`);
    }
    return path.join(this.dir, `${key.ownerId}.${key.designId}.jsonl`);
  }

  cidsFileFor(doc: string): string {
    return this.fileFor(doc).replace(/\.jsonl$/, ".cids.json");
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
  read(doc: string): Promise<JournalEntry[]> {
    // After any write on its way, so a room opening again never reads half a line.
    return this.serial(doc, () => this.readNow(doc));
  }

  private async readNow(doc: string): Promise<JournalEntry[]> {
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

  /** Appends one entry; settles once it is synced to disk. A doc's lines land in order. */
  append(doc: string, entry: JournalEntry): Promise<void> {
    return this.appendLine(doc, `${JSON.stringify(entry)}\n`);
  }

  /** Appends one entry already serialized (with its newline), as `append`. */
  appendLine(doc: string, text: string): Promise<void> {
    const done = new Promise<void>((resolve, reject) => {
      let lines = this.waiting.get(doc);
      if (!lines) {
        lines = [];
        this.waiting.set(doc, lines);
      }
      lines.push({ text, resolve, reject });
    });
    // A failure is the caller's to handle; this copy only marks the end.
    const settled = done.catch(() => undefined);
    this.last.set(doc, done);
    void settled.then(() => {
      if (this.last.get(doc) === done) {
        this.last.delete(doc);
      }
    });
    this.schedule(doc);
    return done;
  }

  /**
   * Settles when every line appended for the doc so far is on disk (rejects
   * when the write of the last one failed).
   */
  durable(doc: string): Promise<void> {
    return this.last.get(doc) ?? Promise.resolve();
  }

  private schedule(doc: string): void {
    if (this.writing.has(doc)) {
      return;
    }
    this.writing.add(doc);
    setImmediate(() => void this.serial(doc, () => this.writeGroup(doc)));
  }

  /** Everything waiting for the doc, in one write and one sync. */
  private async writeGroup(doc: string): Promise<void> {
    const lines = this.waiting.get(doc) ?? [];
    this.waiting.delete(doc);
    try {
      if (lines.length > 0) {
        await mkdir(this.dir, { recursive: true });
        const handle = await open(this.fileFor(doc), "a");
        try {
          await handle.write(lines.map((line) => line.text).join(""));
          await handle.datasync();
          this.writes += 1;
        } finally {
          await handle.close();
        }
      }
      lines.forEach((line) => line.resolve());
    } catch (error) {
      lines.forEach((line) => line.reject(error));
    } finally {
      this.writing.delete(doc);
      if (this.waiting.has(doc)) {
        this.schedule(doc);
      }
    }
  }

  /** The batch ids the last trim kept for a doc, oldest first. A damaged file reads as none. */
  async readCids(doc: string): Promise<AppliedCid[]> {
    let text: string;
    try {
      text = await readFile(this.cidsFileFor(doc), "utf8");
    } catch {
      return [];
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        (entry): entry is AppliedCid =>
          Array.isArray(entry) && typeof entry[0] === "string" && Number.isInteger(entry[1]),
      );
    } catch {
      return [];
    }
  }

  /**
   * Keeps only the entries after `seq` (a flush reached it): usually removes
   * the file. `cids`, the room's recently applied batch ids, are written first
   * (whole, through a rename), so at no moment are they in neither file; when
   * they cannot be written the journal stays as it is (its entries carry their
   * cids) and the next flush trims it.
   */
  trim(doc: string, seq: number, cids?: AppliedCid[]): Promise<void> {
    return this.serial(doc, async () => {
      if (cids && !(await this.writeCids(doc, cids))) {
        return;
      }
      const rest = (await this.readNow(doc)).filter((entry) => entry.seq > seq);
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

  private async writeCids(doc: string, cids: AppliedCid[]): Promise<boolean> {
    const file = this.cidsFileFor(doc);
    const text = JSON.stringify(cids);
    try {
      await mkdir(this.dir, { recursive: true });
      const temp = `${file}.tmp`;
      await writeFile(temp, text);
      try {
        await rename(temp, file);
      } catch {
        // Windows refuses a rename over a file something holds open for a
        // moment (a scanner): write it in place instead.
        await writeFile(file, text);
        await rm(temp, { force: true });
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Forgets a doc's journal and its batch ids (the plan was deleted). Lines still waiting are refused. */
  remove(doc: string): Promise<void> {
    const waiting = this.waiting.get(doc) ?? [];
    this.waiting.delete(doc);
    waiting.forEach((line) => line.reject(new Error("The plan's journal was removed.")));
    return this.serial(doc, async () => {
      await rm(this.fileFor(doc), { force: true });
      await rm(this.cidsFileFor(doc), { force: true });
    });
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
