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
  ORACLE_ALLOT_QUEUE: 20261140,
  ORACLE_ALLOT_FEE: 20261141,
  ORACLE_ALLOT_TENURE: 20261142,
  // Garden properties
  INV_ONE_TENURE: 20261143,
  INV_SEQ_FIXED: 20261144,
  INV_BALANCE_GARDEN: 20261145,
  INV_ONE_OPEN_OFFER: 20261146,
  INV_NO_LIVING_PUBLIC_GARDEN: 20261147,
  // Committee exchange
  INV_EXCHANGE_CLOSED: 20261150,
  INV_EXCHANGE_ORDER: 20261151,
  INV_EXCHANGE_COMPARE: 20261152,
  INV_EXCHANGE_SLIP: 20261153,
  INV_EXCHANGE_LABEL: 20261154,
  // Faults found on the live site (spec 06, Z23)
  INV_OFFER_AFTER_JOINED: 20261160,
  INV_FAMILY_SAVE_ROWS: 20261161,
  INV_FAMILY_SAVE_TICKS: 20261162,
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
