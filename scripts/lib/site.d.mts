// Types for the part of site.mjs that tests read.
export function shellOf(siteDir: string): { version: string; files: string[] };
export function dedupeFonts(siteDir: string, appFolders: readonly string[]): { removed: string[]; moved: string[] };
