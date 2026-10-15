/**
 * Every room's writes of its whole plan go through one queue, so the
 * database sees a few at a time however many plans are open, and none while
 * it is failing: each failure pauses the queue, longer each time (from half a
 * second to 30 s), and a success lifts the pause. A room waiting here keeps
 * its edits in its journal meanwhile.
 */
export class FlushQueue {
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  private failures = 0;
  private pausedUntil = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private draining = false;

  constructor(
    private readonly concurrency = 4,
    private readonly firstPauseMs = 500,
    private readonly longestPauseMs = 30_000,
  ) {}

  /** The service is stopping: every flush waiting goes now, pause or not. */
  drain(): void {
    this.draining = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.next();
  }

  /** Flushes waiting for a turn. */
  get backlog(): number {
    return this.waiting.length;
  }

  /** Runs `job` when its turn comes; a job that throws counts as the database failing. */
  async run<T>(job: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
      this.next();
    });
    try {
      const result = await job();
      this.failures = 0;
      this.pausedUntil = 0;
      return result;
    } catch (error) {
      this.failures += 1;
      const pause = Math.min(this.longestPauseMs, this.firstPauseMs * 2 ** (this.failures - 1));
      this.pausedUntil = Date.now() + pause;
      throw error;
    } finally {
      this.running -= 1;
      this.next();
    }
  }

  private next(): void {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const wait = this.draining ? 0 : this.pausedUntil - Date.now();
      if (wait > 0) {
        if (!this.timer) {
          this.timer = setTimeout(() => {
            this.timer = undefined;
            this.next();
          }, wait);
          this.timer.unref?.();
        }
        return;
      }
      this.running += 1;
      this.waiting.shift()!();
    }
  }
}
