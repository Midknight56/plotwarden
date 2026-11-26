// The return slip the keeper opened, kept in memory for this visit to one register (spec 05, X14).
// No React and no storage. The keeper holds the bytes of the chosen file and nothing worked out from them, so
// every row is read again from the register as it is when the screen draws.
import type { Uuid } from "../types";

/** The file the keeper chose, and the one operation ID minted for it. */
export interface KeptSlip {
  bytes: Uint8Array;
  opId: Uuid;
}

export interface SlipKeeper {
  /** Hold a slip for one register. It replaces whatever was held, for any register. */
  keep(siteId: Uuid, slip: KeptSlip): void;
  /** The slip held for this register, or nothing when none is held or it belongs to another register. */
  recall(siteId: Uuid): KeptSlip | undefined;
  /** Let go of the slip. */
  clear(): void;
}

export function createSlipKeeper(): SlipKeeper {
  let held: { siteId: Uuid; slip: KeptSlip } | undefined;
  return {
    keep: (siteId, slip) => {
      held = { siteId, slip };
    },
    recall: (siteId) => (held !== undefined && held.siteId === siteId ? held.slip : undefined),
    clear: () => {
      held = undefined;
    },
  };
}
