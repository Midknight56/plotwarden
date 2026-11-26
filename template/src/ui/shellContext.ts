// What the screens share: the app, the database, the route, the words and the open register.
// No JSX here, so every screen can import it without a loop.
import type { ComponentType } from "react";
import { createContext, useContext } from "react";
import type { Register, RegisterAdapter } from "../adapter";
import type { BaseState } from "../base";
import type { LocalDate } from "../calendar";
import type { SheetImporter } from "../data/importBatch";
import type { Walkthrough } from "../data/seed";
import type { BlobWrite, CommitError } from "../data/transaction";
import type { StoredEvent } from "../events";
import type { Settings } from "../preferences";
import type { SearchName } from "../search";
import type { SlipKeeper } from "./keptSlip";
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
  /** Replaces the shared register home. */
  home?: ComponentType;
  /** Screens under a register, by the area of the route: `#/r/<site>/<area>/<arg>`. */
  routes?: Readonly<Record<string, ComponentType<{ arg?: string }>>>;
  /** Shown inside the plot screen, under its heading. */
  plotExtras?: ComponentType<{ plotId: string }>;
  /** A practice register that opens in its own workspace. */
  walkthrough?: Walkthrough;
  /**
   * A file of invented records that the Import screen offers beside the column guide. `href` is relative to the page
   * of the app, so it works from any folder the app is served from and from the offline shell.
   */
  practiceBook?: { href: string; fileName: string };
}

export type AnyApp = RegisterApp<BaseState, { type: string }, { type: string }>;

export interface Route {
  /** The path segments of the hash, for example ["r", "abc", "map"]. */
  path: string[];
  query: URLSearchParams;
  /**
   * The search text of a register home. It lives in `history.state`, never in the address, because a searched name
   * is private. It is empty on any route that was not reached by a search.
   */
  search: string;
}

export type { Settings } from "../preferences";
export { DEFAULT_SETTINGS } from "../preferences";

export interface ShellValue {
  app: AnyApp;
  register: Register<BaseState, { type: string }, { type: string }>;
  db: IDBDatabase;
  t(key: string, values?: Readonly<Record<string, string | number>>): string;
  route: Route;
  /**
   * Go to a hash route, for example "/r/abc/map?plot=p". `search` is the text of a search. It is kept in the history
   * entry and never in the address.
   */
  navigate(to: string, options?: { replace?: boolean; search?: string }): void;
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
  /**
   * The return slip the keeper opened in this visit to this register, held in memory only. It is let go when the
   * register changes or the keeper leaves it. It is never stored.
   */
  slips: SlipKeeper;
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
  for (const [key, value] of Object.entries(query ?? {})) if (key !== "q" && value !== undefined && value !== "") q.set(key, value);
  const text = q.toString();
  return `#/${path.join("/")}${text === "" ? "" : `?${text}`}`;
}

/** Read a hash such as "#/r/abc/map?plot=p" into a route. A `q` in the address is never read as a search. */
export function parseHash(hash: string, search = ""): Route {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  const [pathPart = "", queryPart = ""] = body.split("?");
  const query = new URLSearchParams(queryPart);
  query.delete("q");
  return { path: pathPart.split("/").filter((s) => s !== "").map(decodeURIComponent), query, search };
}

/** The search text kept in a history entry, or an empty text. */
export function searchOfState(state: unknown): string {
  const q = (state as { q?: unknown } | null)?.q;
  return typeof q === "string" ? q : "";
}
