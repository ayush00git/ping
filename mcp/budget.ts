// A cap on GitHub lookups from the MCP server. ping is for looking people up one at a time, by hand
// (PLAN.md, "Note on use"); an agent in a loop could otherwise look up hundreds of people an hour.

export class LimitReached extends Error {
  constructor(
    public what: string, // "lookups", "LinkedIn searches"
    public max: number,
    public retryAt: Date,
  ) {
    super(`At most ${max} ${what} an hour.`);
  }
}

/** At most `max` uses in any hour. `take()` records a use, or throws LimitReached. */
export function budget(what: string, max: number, now = Date.now) {
  const HOUR = 3_600_000;
  const uses: number[] = [];
  return {
    take() {
      const t = now();
      while (uses.length && uses[0] <= t - HOUR) uses.shift();
      if (uses.length >= max) throw new LimitReached(what, max, new Date(uses[0] + HOUR));
      uses.push(t);
    },
  };
}
