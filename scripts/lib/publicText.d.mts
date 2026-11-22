export interface Finding {
  line: number;
  rule: "dash" | "vendor" | "contest" | "local-path";
  match: string;
}

/** Find what public text must not hold. Which rules apply depends on the file type in `path`. */
export function scanText(path: string, text: string): Finding[];
