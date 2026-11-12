/**
 * Runs `flush` once changes stop for `quietMs`, and at the latest `maxDelayMs` after the first
 * change it has not flushed yet, however busy the page stays.
 */
export function debounce(flush: () => void, quietMs: number, maxDelayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first: number | undefined;
  const run = () => {
    clearTimeout(timer);
    timer = undefined;
    first = undefined;
    flush();
  };
  return {
    schedule() {
      const now = Date.now();
      first ??= now;
      clearTimeout(timer);
      timer = setTimeout(run, Math.min(quietMs, Math.max(0, first + maxDelayMs - now)));
    },
    /** Runs a scheduled flush now. */
    now() { if (timer !== undefined) run(); },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      first = undefined;
    },
  };
}
