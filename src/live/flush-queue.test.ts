import { describe, expect, it } from "vitest";
import { FlushQueue } from "./flush-queue";

/** A job the test finishes by hand. */
function held<T>(value: T) {
  let finish!: () => void;
  let fail!: (error: unknown) => void;
  const done = new Promise<T>((resolve, reject) => {
    finish = () => resolve(value);
    fail = reject;
  });
  return { job: () => done, finish, fail };
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the flush queue", () => {
  it("runs a few writes at a time, in order", async () => {
    const queue = new FlushQueue(2);
    const started: number[] = [];
    const jobs = [0, 1, 2, 3].map((n) => held(n));
    const results = jobs.map((entry, n) =>
      queue.run(() => {
        started.push(n);
        return entry.job();
      }),
    );
    await turn();
    expect(started).toEqual([0, 1]);
    expect(queue.backlog).toBe(2);
    jobs[1]!.finish();
    await turn();
    expect(started).toEqual([0, 1, 2]);
    jobs.forEach((entry) => entry.finish());
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3]);
  });

  it("rests the database after a failure, longer each time, until one succeeds", async () => {
    const queue = new FlushQueue(1, 200, 1000);
    await expect(queue.run(() => Promise.reject(new Error("down")))).rejects.toThrow("down");
    let ran = false;
    const after = queue.run(async () => {
      ran = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ran).toBe(false);
    await after;
    expect(ran).toBe(true);
    // Succeeded: no rest before the next.
    const started = Date.now();
    await queue.run(async () => undefined);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("lets everything waiting go at once when the service stops", async () => {
    const queue = new FlushQueue(1, 60_000, 60_000);
    await expect(queue.run(() => Promise.reject(new Error("down")))).rejects.toThrow();
    let ran = false;
    const waiting = queue.run(async () => {
      ran = true;
    });
    await turn();
    expect(ran).toBe(false);
    queue.drain();
    await waiting;
    expect(ran).toBe(true);
  });
});
