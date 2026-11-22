export interface Finding {
  line: number;
  /** "dash", "local-path", or the name of the list that the word came from. */
  rule: string;
  match: string;
}

/** One list of a banned words file, compiled. The matcher finds a whole word in any letter case. */
export interface BannedList {
  rule: string;
  matcher: RegExp;
}

/** Check that `lists` is an object of lists of words and compile each list that holds a word. Throws an Error that names the fault. */
export function compileBanned(lists: unknown): BannedList[];

/** Read a banned words file and compile it. Throws an Error that names the fault. */
export function loadBannedWords(file: string): BannedList[];

/** Find what public text must not hold. Which rules apply depends on the file type in `path`. Without `banned`, only the generic rules run. */
export function scanText(path: string, text: string, banned?: BannedList[]): Finding[];
