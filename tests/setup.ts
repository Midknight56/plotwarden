// Vitest runs in Node, which has no IDBKeyRange. The browser has one. Use the one
// from the fake database, so code that builds a key range runs the same in a test.
import { IDBKeyRange } from "fake-indexeddb";

Object.assign(globalThis, { IDBKeyRange });