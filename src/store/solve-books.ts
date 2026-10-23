import { calculateThroughput } from "@/lib/solver";
import {
  attachStranded,
  carryStranded,
  withStranded,
  type StrandedPatch,
} from "@/components/flow/stranded-surplus";
import type { FactoryProject, ThroughputResult } from "@/lib/model/types";

/**
 * The store's one door to the solver, sized to the board it is asked about.
 *
 * A small board solves synchronously: the result is back before the state
 * update lands. A BIG board must not run on the main thread (seconds to
 * minutes, on every edit and tab switch). It moves to a Web Worker: the
 * caller gets its previous books back immediately, flagged `stale`, and the
 * real result replaces `lastResult` through the sink when the worker lands.
 *
 * Finished big-board books are kept in a small content-keyed LRU, so
 * switching tabs between unchanged big plans is instant; the design store
 * re-reads a plan from IndexedDB on every switch, so the cache cannot key on
 * object identity.
 *
 * Rapid edits coalesce: one solve runs at a time, only the newest waiting
 * plan is kept, and a result for a plan no longer on the canvas is cached
 * but never shown. Environments without workers (SSR, vitest, old browsers)
 * keep the synchronous path for every size.
 */

/**
 * Nodes plus edges above which the solve leaves the main thread. Around this
 * size the homegrown simplex already takes 100ms+ per edit (the worker's
 * HiGHS stays under 50ms), and main-thread time grows roughly cubically.
 */
const SYNC_SOLVE_LIMIT = 120;

/**
 * Size is not the whole story. One more reason to leave the main thread:
 * this plan's last MAIN-THREAD solve took longer than SLOW_SOLVE_MS (three
 * frames: past it every edit stutters, and in Firefox a hang that long clips
 * the board's sounds, see board-sounds.ts).
 */
const SLOW_SOLVE_MS = 50;
/**
 * SOLVE MODE is far heavier on the homegrown simplex: six dense solves over
 * every machine and wire at once, and pool mode (which rides on solve mode)
 * adds a pool drawer per resource. It can run several times slower than plan
 * mode there, while HiGHS (worker only) stays fast. Past this small size it
 * always goes to the worker rather than waiting for the slow-solve rule to
 * learn from a frozen tab.
 */
const SOLVE_MODE_SYNC_LIMIT = 40;

/**
 * The last MAIN-THREAD solve's wall time, and the plan it was measured on.
 * Only a synchronous solve may write it: the worker runs HiGHS, roughly ten
 * times faster than the main thread's simplex, so its timing says nothing
 * about how long the tab would freeze (letting it count would send a slow
 * plan back to the main thread). A slow plan therefore stays with the worker
 * for the session; another plan decides by its own size.
 */
let lastSolveDurationMs: number | undefined;
let lastSolveProjectId: string | undefined;

/**
 * Every edit solves; there is no manual recalculation. The old board toolbar's
 * switch for it saved "off" here, and plan boards show no such switch, so a
 * browser holding it showed every plan it opened at zero with no way out. The
 * stored value is removed on load so no browser stays stuck in it.
 */
try {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("gtnh-factory-flow.auto-solve.v1");
  }
} catch {
  // Storage refused (a private window): nothing was stored either.
}

const BIG_BOOKS_CACHE_LIMIT = 8;
const bigBooksCache = new Map<string, ThroughputResult>();

interface SolveRequest {
  key: string;
  project: FactoryProject;
}

let sink: ((result: ThroughputResult) => void) | undefined;
let worker: Worker | undefined;
let workerBroken = false;
let inFlight: SolveRequest | undefined;
let queued: SolveRequest | undefined;
/** The content key of the plan the canvas currently shows, when it is big. */
let currentKey: string | undefined;
/** The last books handed out, big or small: what a stale placeholder wears. */
let lastBooks: ThroughputResult | undefined;

/** Where finished worker solves land; the factory store registers itself. */
export function registerBooksSink(apply: (result: ThroughputResult) => void) {
  sink = apply;
}

export function solveBooks(project: FactoryProject): ThroughputResult {
  const size = project.nodes.length + project.edges.length;
  const provenSlow =
    lastSolveDurationMs !== undefined &&
    lastSolveDurationMs > SLOW_SOLVE_MS &&
    lastSolveProjectId === project.id;
  const expectSlow =
    size > SYNC_SOLVE_LIMIT ||
    provenSlow ||
    ((project.solveMode === true || project.poolMode === true) && size > SOLVE_MODE_SYNC_LIMIT) ||
    // Plan mode runs integer programs (HiGHS, which only the worker loads): the worker whenever there is one.
    project.planMode === true;
  if (!expectSlow || !workerAvailable()) {
    const started = performance.now();
    const result = solveOnMainThread(project);
    lastSolveDurationMs = performance.now() - started;
    lastSolveProjectId = project.id;
    currentKey = undefined;
    lastBooks = result;
    return result;
  }

  const key = booksContentKey(project);
  currentKey = key;
  const cached = bigBooksCache.get(key);
  if (cached) {
    // LRU bump.
    bigBooksCache.delete(key);
    bigBooksCache.set(key, cached);
    lastBooks = cached;
    return cached;
  }

  scheduleSolve({ key, project });
  // The previous books stand in while the worker runs. After a tab switch
  // they belong to another plan, whose node ids simply miss - the board reads
  // that as empty books until the real ones land, which is the honest state.
  const placeholder: ThroughputResult = lastBooks
    ? { ...lastBooks, stale: true }
    : emptyBooks();
  lastBooks = placeholder;
  return placeholder;
}

/**
 * The plan as the solver sees it. The `view` block is how the board is DRAWN
 * and never reaches the solver, so it must not invalidate finished books; the
 * design store also restamps it on every save, which would defeat the cache.
 */
function booksContentKey(project: FactoryProject): string {
  const { view: _view, ...solved } = project;
  return JSON.stringify(solved);
}

function workerAvailable(): boolean {
  return !workerBroken && typeof Worker !== "undefined";
}

function scheduleSolve(request: SolveRequest) {
  if (inFlight) {
    // Only the newest waiting plan matters; intermediates were superseded.
    queued = request;
    return;
  }
  inFlight = request;
  try {
    getWorker().postMessage({ key: request.key, project: request.project });
  } catch (error) {
    console.error("solve worker failed to start; solving on the main thread", error);
    workerBroken = true;
    inFlight = undefined;
    deliver(request.key, solveOnMainThread(request.project));
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./solve-books.worker.ts", import.meta.url));
    worker.onmessage = (
      event: MessageEvent<{
        key: string;
        result?: ThroughputResult;
        error?: string;
        solveMs?: number;
        stranded?: StrandedPatch | null | "skipped";
      }>,
    ) => {
      // The stranded-spare search that follows some books: not a solve, so it never touches the queue.
      if (event.data.stranded !== undefined) {
        landStranded(event.data.key, event.data.stranded);
        return;
      }
      const { key, result, error } = event.data;
      inFlight = undefined;
      if (result) {
        // `solveMs` is deliberately not read: see lastSolveDurationMs.
        deliver(key, result);
      } else {
        console.error("solve worker error:", error);
      }
      if (queued) {
        const next = queued;
        queued = undefined;
        // A queued repeat of what just finished (or of anything already
        // solved) serves from the cache instead of solving twice.
        const cached = bigBooksCache.get(next.key);
        if (cached) {
          if (next.key === currentKey) {
            lastBooks = cached;
            sink?.(cached);
          }
        } else {
          scheduleSolve(next);
        }
      }
    };
    worker.onerror = (event) => {
      // A worker that cannot run its script would fail every solve silently;
      // fall back to the blocking path rather than showing stale books forever.
      console.error("solve worker broke; falling back to main-thread solves", event.message);
      workerBroken = true;
      const retry = queued ?? inFlight;
      inFlight = undefined;
      queued = undefined;
      if (retry) {
        deliver(retry.key, solveOnMainThread(retry.project));
      }
    };
  }
  return worker;
}

function deliver(key: string, landed: ThroughputResult) {
  // Books whose stranded-spare search is still running keep the hint the last books gave while it still holds.
  const result = landed.plan?.strandedPending ? carryStranded(lastBooks, landed) : landed;
  bigBooksCache.set(key, result);
  while (bigBooksCache.size > BIG_BOOKS_CACHE_LIMIT) {
    const oldest = bigBooksCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    bigBooksCache.delete(oldest);
  }
  if (key === currentKey) {
    lastBooks = result;
    sink?.(result);
  }
}

/**
 * The worker's stranded-spare search for books it already sent: merged into those books, kept and shown if they are
 * still the canvas's. A search stopped for newer books leaves its books out of the cache, so coming back to that plan
 * solves (and searches) it again; if they are somehow still shown, they lose the carried hint rather than keep it.
 */
function landStranded(key: string, patch: StrandedPatch | null | "skipped") {
  const books = bigBooksCache.get(key);
  if (!books?.plan?.strandedPending) return;
  if (patch === "skipped" && key !== currentKey) {
    bigBooksCache.delete(key);
    return;
  }
  const next = withStranded(books, patch === "skipped" || patch === null ? undefined : patch);
  bigBooksCache.set(key, next);
  if (key === currentKey) {
    lastBooks = next;
    sink?.(next);
  }
}

/**
 * A solve on this thread, with the diagnosis the worker attaches to its books too (a plan-mode line stalled by a
 * spare output, `attachStranded`), so the board reads the same whichever path solved it. Plan mode only comes here
 * with no worker (tests, SSR, old browsers) or a broken one.
 */
function solveOnMainThread(project: FactoryProject): ThroughputResult {
  const result = calculateThroughput(project);
  attachStranded(project, result);
  return result;
}

function emptyBooks(): ThroughputResult {
  return {
    nodes: {},
    storages: {},
    resources: {},
    edges: {},
    totalEuT: 0,
    totalEuPerSecond: 0,
    bottlenecks: [],
    externalInputs: [],
    unconsumedOutputs: [],
    generatedAt: new Date().toISOString(),
    stale: true,
  };
}
