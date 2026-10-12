import { clientAddress, countEvents, recordEvents, saltedKey } from "./community";
import type { FeedbackReport } from "./feedback";

/**
 * What stands between `/api/feedback` and a public issue. On 2026-10-12 it was flooded from about 5,000 residential
 * addresses (one to three reports each) with the mod's own user agent and made-up versions, and the old limit, keyed
 * on the client's own device id, let through over 400 issues. So no one check holds it alone:
 *
 * - the report must look like the mod's (its device id and version shapes);
 * - a process-wide gate takes at most `ARRIVALS_PER_MINUTE` reports a minute to the database, and a flood of refusals
 *   pauses reports altogether for `PAUSE_MS`;
 * - per address and per device, a few an hour and a day;
 * - the same words are taken once a month;
 * - and the whole site opens at most `SITE_PER_HOUR` / `SITE_PER_DAY` issues, whoever sends them.
 *
 * The site is one Node process, so the gate and the lock around the counts are in memory.
 */

/** As `Tags.VERSION`: 0.2.0-alpha.5, or a dev build's 0.2.0-alpha.2-main.3+7736a2234d. */
const MOD_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;
/** The GTNH core mod's version (2.9.84, 2.9.0-RC-2), or nothing in a game without it. */
const PACK_VERSION = /^(?:\d+(?:\.\d+)+(?:[-+.][0-9A-Za-z.+-]+)?)?$/;
/** `java.version`: 25.0.1, 1.8.0_402, 21.0.5+11. */
const JAVA_VERSION = /^\d+(?:\.\d+)*(?:[._+-][0-9A-Za-z._+-]*)?$/;
/** `os.name` and `os.version`: Windows 11 10.0, Linux 6.16.12-valve24.5-1-neptune-616-gb2f7cfe85e45. */
const OS = /^[A-Za-z0-9 ._()/+-]{1,100}$/;
/** `Account.deviceId()`: its prefix and a UUID (plannh- before the rename). */
const DEVICE =
  /^(?:gtnhplanner|plannh)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Whether the report is shaped as the mod sends one. It proves little (the mod is open), but stops the lazy. */
export function looksSentByTheGame(report: FeedbackReport): boolean {
  const v = report.versions;
  return (
    DEVICE.test(report.deviceId) &&
    MOD_VERSION.test(v.mod) &&
    PACK_VERSION.test(v.pack) &&
    JAVA_VERSION.test(v.java) &&
    OS.test(v.os)
  );
}

/** The report's words, as the duplicate check compares them: case, spacing and punctuation aside. */
export function wordsOf(report: FeedbackReport): string {
  return `${report.title}\n${report.description}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const ARRIVALS_PER_MINUTE = 30;
/** Refusals in `FLOOD_WINDOW_MS` that mean a flood. */
export const FLOOD_REFUSALS = 60;
const FLOOD_WINDOW_MS = 10 * 60 * 1000;
export const PAUSE_MS = 6 * 60 * 60 * 1000;

/** The in-memory first line: a cap on arrivals, and a pause once refusals pile up. Cheap, before any parsing. */
export class FeedbackGate {
  private arrivals: number[] = [];
  private refusals: number[] = [];
  private pausedUntil = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** "open" lets the report on; "busy" past the minute's share; "paused" after a flood. */
  admit(): "open" | "busy" | "paused" {
    const t = this.now();
    if (t < this.pausedUntil) {
      return "paused";
    }
    this.arrivals = this.arrivals.filter((a) => t - a < 60_000);
    if (this.arrivals.length >= ARRIVALS_PER_MINUTE) {
      this.refused();
      return "busy";
    }
    this.arrivals.push(t);
    return "open";
  }

  /** A report turned away for any reason; enough of them pauses reports. */
  refused(): void {
    const t = this.now();
    this.refusals = this.refusals.filter((r) => t - r < FLOOD_WINDOW_MS);
    this.refusals.push(t);
    if (this.refusals.length >= FLOOD_REFUSALS) {
      this.pausedUntil = t + PAUSE_MS;
      this.refusals = [];
      console.warn(
        `feedback: ${FLOOD_REFUSALS} reports refused in ${FLOOD_WINDOW_MS / 60_000} min; paused until ${new Date(this.pausedUntil).toISOString()}`,
      );
    }
  }
}

export const feedbackGate = new FeedbackGate();

export const PER_SENDER_HOUR = 3;
export const PER_SENDER_DAY = 10;
export const SITE_PER_HOUR = 10;
export const SITE_PER_DAY = 40;
const SAME_WORDS_SECONDS = 30 * 24 * 60 * 60;

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Why a report may not become an issue, as the player is told. */
export type Refusal = { status: number; error: string };

let queue: Promise<unknown> = Promise.resolve();

/** One at a time, so two reports cannot both read a count under its limit. */
function serially<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Checks every count the report must be under and, when it is, records it against all of them before answering, so
 * the issue it goes on to open is already counted.
 */
export function claimIssue(request: Request, report: FeedbackReport): Promise<Refusal | undefined> {
  const address = `feedback:address:${saltedKey(clientAddress(request))}`;
  const device = `feedback:device:${saltedKey(report.deviceId)}`;
  const words = `feedback:words:${saltedKey(wordsOf(report))}`;
  const site = "feedback:site";
  return serially(async () => {
    const [addressHour, addressDay, deviceHour, deviceDay, siteHour, siteDay, sameWords] =
      await Promise.all([
        countEvents(address, "feedback", HOUR),
        countEvents(address, "feedback", DAY),
        countEvents(device, "feedback", HOUR),
        countEvents(device, "feedback", DAY),
        countEvents(site, "feedback", HOUR),
        countEvents(site, "feedback", DAY),
        countEvents(words, "feedback", SAME_WORDS_SECONDS),
      ]);
    if (sameWords > 0) {
      return { status: 409, error: "That report was sent already." };
    }
    if (addressHour >= PER_SENDER_HOUR || deviceHour >= PER_SENDER_HOUR) {
      return { status: 429, error: "That's a lot of reports. Try again in an hour." };
    }
    if (addressDay >= PER_SENDER_DAY || deviceDay >= PER_SENDER_DAY) {
      return { status: 429, error: "That's a lot of reports for one day. Try again tomorrow." };
    }
    if (siteHour >= SITE_PER_HOUR || siteDay >= SITE_PER_DAY) {
      return {
        status: 503,
        error: "Lots of reports are coming in right now. Try again in a few hours.",
      };
    }
    await recordEvents(
      [address, device, site, words].map((actorKey) => ({ actorKey, action: "feedback" })),
    );
    return undefined;
  });
}
