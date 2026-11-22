// What the screens share: the app, the database, the route, the words and the open register.
// No JSX here, so every screen can import it without a loop.
import { createContext, useContext } from "react";
import type { Register, RegisterAdapter } from "../adapter";
import type { BaseState } from "../base";
import type { LocalDate } from "../calendar";
import type { SheetImporter } from "../data/importBatch";
import type { BlobWrite, CommitError } from "../data/transaction";
import type { StoredEvent } from "../events";
import type { SearchName } from "../search";
import type { DomainError, Site, Uuid } from "../types";

/** What an app entry hands to the shell. The app owns its words, rules and sheets. */
export interface RegisterApp<S extends BaseState, C extends { type: string }, E extends { type: string }> {
  adapter: RegisterAdapter<S, C, E>;
  /** The app title, for example "Churchyard Register". */
  title: string;
  importers: readonly SheetImporter<S, C>[];
  /** Names to search. A record with no plotId is shown as "Location to confirm". */
  records(state: S): { plotId?: Uuid; name: SearchName }[];
  factory?: IDBFactory;
  now?: () => Date;
  newId?: () => string;
  version?: string;
}

export type AnyApp = RegisterApp<BaseState, { type: string }, { type: string }>;

export interface Route {
  /** The path segments of the hash, for example ["r", "abc", "map"]. */
  path: string[];
  query: URLSearchParams;
}

export interface Settings {
  motion: "follow" | "reduce";
  contrast: "standard" | "high";
  paper: "A4" | "Letter";
}

export const DEFAULT_SETTINGS: Settings = { motion: "follow", contrast: "standard", paper: "A4" };

export interface ShellValue {
  app: AnyApp;
  register: Register<BaseState, { type: string }, { type: string }>;
  db: IDBDatabase;
  t(key: string, values?: Readonly<Record<string, string | number>>): string;
  route: Route;
  /** Go to a hash route, for example "/r/abc/map?plot=p". */
  navigate(to: string, options?: { replace?: boolean }): void;
  settings: Settings;
  setSettings(next: Settings): void;
  now(): Date;
  newId(): string;
  /** Another tab or a removal changed the list of registers. */
  sitesVersion: number;
  bumpSites(): void;
}

/** A command with its fields. The register checks each one before it writes. */
export type AnyCommand = { type: string; [field: string]: unknown };

export interface RunOptions {
  opId?: Uuid;
  blobs?: BlobWrite[];
  on?: LocalDate;
}

export type RunOutcome =
  | { ok: true; revision: number; replayed: boolean }
  | { ok: false; code: string; error?: DomainError; commit?: CommitError };

export interface OpenRegister {
  site: Site;
  state: BaseState;
  events: StoredEvent[];
  revision: number;
  today: LocalDate;
  /** Another tab saved a later revision. */
  stale: boolean;
  run(commands: AnyCommand[], options?: RunOptions): Promise<RunOutcome>;
  reload(): Promise<void>;
}

export const ShellContext = createContext<ShellValue | null>(null);
export const RegisterContext = createContext<OpenRegister | null>(null);

export function useShell(): ShellValue {
  const value = useContext(ShellContext);
  if (value === null) throw new Error("This screen needs the register shell around it");
  return value;
}

export function useRegister(): OpenRegister {
  const value = useContext(RegisterContext);
  if (value === null) throw new Error("This screen needs an open register");
  return value;
}

/** Make a hash route from path segments and a query. */
export function hashFor(path: readonly string[], query?: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== "") q.set(key, value);
  const text = q.toString();
  return `#/${path.join("/")}${text === "" ? "" : `?${text}`}`;
}

/** Read a hash such as "#/r/abc/map?plot=p" into a route. */
export function parseHash(hash: string): Route {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const [pathPart = "", queryPart = ""] = body.split("?");
  return { path: pathPart.split("/").filter((s) => s !== "").map(decodeURIComponent), query: new URLSearchParams(queryPart) };
}
