import { calculateThroughput } from "@/lib/solver";
import { initLpEngine } from "@/lib/solver/lp-engine";
import { attachClogLocks } from "@/components/flow/clog-lock";
import { strandedSteps, strandedWanted } from "@/components/flow/stranded-surplus";
import type { FactoryProject, ThroughputResult } from "@/lib/model/types";

// HiGHS loads once at worker startup, and every solve waits for the load to
// settle: a board routed here is slow by definition, so a one-time wasm
// fetch is always the better trade than a minutes-long homegrown walk. A
// failed load resolves too - solves then run on the homegrown simplex.
// The route serves them from the package in any start mode; public/ (copied by predev and prebuild) is the fallback.
const engineReady = initLpEngine({
  glueUrl: "/api/highs/highs.js",
  wasmUrl: "/api/highs/highs.wasm",
  fallback: { glueUrl: "/highs.js", wasmUrl: "/highs.wasm" },
});

/**
 * The solver, off the main thread. One message in (a plan and the content key
 * that names it), one message out (the same key and the finished books). The
 * scheduling - coalescing rapid edits, dropping superseded solves, deciding
 * which result is still current - all lives on the store side in
 * `solve-books.ts`; this file stays a dumb calculator on purpose.
 *
 * One more message follows books that have an Up to line stalled at zero: the
 * stranded-spare search (`stranded-surplus.ts`, several what-if solves), sent
 * as `{ key, stranded }` once done. The books go first so no edit waits for
 * the search, and the search stops between its solves when a newer plan has
 * come in (`{ key, stranded: "skipped" }`): those books are no longer shown.
 */
let latest = 0;

/** Lets a newer message in: a task, so a message already queued runs first. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

self.onmessage = async (event: MessageEvent<{ key: string; project: FactoryProject }>) => {
  const ticket = ++latest;
  const { key, project } = event.data;
  let result: ThroughputResult;
  let search = false;
  try {
    await engineReady;
    const started = performance.now();
    result = calculateThroughput(project);
    // The clog-lock proof is a second LP over the same board, and on a plan
    // with many stopped machines a harder one than the books: it runs here,
    // on HiGHS, and rides back on the books so the main thread never runs it.
    attachClogLocks(project, result);
    search = strandedWanted(project, result);
    if (search && result.plan) result.plan.strandedPending = true;
    // The solve's own cost rides back so the router can learn whether this
    // board is one that must stay off the main thread - the diagnosis
    // counts, since a board slow only in its proof must stay here too.
    self.postMessage({ key, result, solveMs: performance.now() - started });
  } catch (error) {
    self.postMessage({ key, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  if (!search) return;
  try {
    const steps = strandedSteps(project, result);
    for (;;) {
      await nextTask();
      if (ticket !== latest) {
        self.postMessage({ key, stranded: "skipped" });
        return;
      }
      const step = steps.next();
      if (step.done) {
        self.postMessage({ key, stranded: step.value ?? null });
        return;
      }
    }
  } catch {
    // A search that breaks finds nothing; the books already landed.
    self.postMessage({ key, stranded: null });
  }
};
