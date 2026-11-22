// A seeded property runner that proves how many cases ran.
// Test helper. The template never imports it.
import fc from "fast-check";
import { FAILING_SEEDS, RUNS } from "../properties/seeds";

export interface PropertyOptions {
  seed: number;
  runs?: number;
}

/**
 * Run a property for `runs` generated cases from a recorded seed. Fails if
 * fewer cases ran than asked. Re-runs every seed that once failed for the
 * same requirement, so a fixed bug stays fixed.
 */
export function runProperty<T>(
  requirement: string,
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => void | boolean,
  options: PropertyOptions,
): { cases: number } {
  const runs = options.runs ?? RUNS;
  if (runs < RUNS) throw new Error(`A property set must run at least ${RUNS} cases, not ${runs}`);
  let cases = 0;
  const wrapped = (value: T) => {
    cases += 1;
    return predicate(value);
  };
  const property = fc.property(arbitrary, wrapped);
  fc.assert(property, { numRuns: runs, seed: options.seed });
  if (cases < runs) throw new Error(`${requirement}: only ${cases} of ${runs} cases ran`);

  for (const failing of FAILING_SEEDS.filter((f) => f.requirement === requirement)) {
    fc.assert(fc.property(arbitrary, predicate), { numRuns: runs, seed: failing.seed });
  }
  return { cases };
}
