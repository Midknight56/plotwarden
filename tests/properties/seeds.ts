// Recorded seeds for every generated test set, and the number of cases each runs.
// A seed that ever finds a failure goes into FAILING_SEEDS next to the
// requirement it broke, and stays there as a regression check.

/** Each property set runs at least this many generated cases (00-contracts R24.4). */
export const RUNS = 1000;

export const SEEDS = {
  // Properties
  INV_REPLAY: 20261121,
  INV_CLAIMS_DISJOINT: 20261122,
  INV_QUEUE_ORDER: 20261123,
  INV_BALANCE: 20261124,
  INV_PUBLIC_CLOSED: 20261125,
  INV_NO_INFERRED_VACANCY: 20261126,
  INV_NO_LIVING_PUBLIC: 20261130,
  INV_GEOM_OVERLAP: 20261131,
  INV_GEOM_INSIDE: 20261132,
  INV_GEOM_SIMPLE: 20261133,
  // Oracle comparison
  ORACLE_QUEUE: 20261127,
  ORACLE_FEE: 20261128,
  ORACLE_TENURE: 20261129,
} as const;

export interface FailingSeed {
  /** The invariant or requirement the case broke, for example INV_BALANCE or R13.7. */
  requirement: string;
  seed: number;
  /** The property or test that found it. */
  found: string;
  /** What was wrong, in a line. */
  note: string;
}

/** Seeds that once failed. None so far. */
export const FAILING_SEEDS: readonly FailingSeed[] = [];
