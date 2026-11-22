// Storage failure injection. Wraps a real (fake-indexeddb) connection so a
// chosen store call throws, like a full disk or a refused write.
// Test helper. The template never imports it.

export interface FailPlan {
  /** The object store whose call should fail. */
  store: string;
  method: "add" | "put";
  error: Error | DOMException;
  /** Let this many calls through first. */
  skip?: number;
}

/** A quota error, as a browser raises it. */
export function quotaError(): DOMException {
  return new DOMException("The quota has been exceeded.", "QuotaExceededError");
}

/** A generic write failure. */
export function writeError(): Error {
  return new Error("Disk write failed");
}

function bindMethods<T extends object>(target: T, prop: string | symbol): unknown {
  const value = Reflect.get(target, prop) as unknown;
  return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
}

/** Return a database whose transactions fail as `plan` says. */
export function failingDb(db: IDBDatabase, plan: FailPlan): IDBDatabase {
  let calls = 0;
  const skip = plan.skip ?? 0;

  const wrapStore = (store: IDBObjectStore): IDBObjectStore =>
    new Proxy(store, {
      get(target, prop) {
        if (prop === plan.method && target.name === plan.store) {
          return (...args: unknown[]) => {
            calls += 1;
            if (calls > skip) throw plan.error;
            return (Reflect.get(target, prop) as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return bindMethods(target, prop);
      },
    });

  const wrapTx = (tx: IDBTransaction): IDBTransaction =>
    new Proxy(tx, {
      get(target, prop) {
        if (prop === "objectStore") return (name: string) => wrapStore(target.objectStore(name));
        return bindMethods(target, prop);
      },
      set(target, prop, value) {
        (target as unknown as Record<string | symbol, unknown>)[prop] = value;
        return true;
      },
    });

  return new Proxy(db, {
    get(target, prop) {
      if (prop === "transaction") {
        return (...args: Parameters<IDBDatabase["transaction"]>) => wrapTx(target.transaction(...args));
      }
      return bindMethods(target, prop);
    },
  });
}

/** A factory that refuses to open, as a browser with storage turned off does. */
export function refusingFactory(): IDBFactory {
  return {
    open() {
      const request = { error: new DOMException("Storage is not allowed.", "SecurityError") } as unknown as IDBOpenDBRequest;
      setTimeout(() => {
        (request.onerror as ((e: unknown) => void) | null)?.({ target: request, preventDefault() {} });
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
}
