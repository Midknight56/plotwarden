// Shared by scripts/check-imports.mjs and scripts/changed-tests.mjs.
// Reads import statements from TypeScript or JavaScript source without
// being fooled by comments, strings, template literals or regex literals.
import { readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".local", "coverage", "test-results", "playwright-report"]);
const SOURCE_FILE = /\.(?:[cm]?[jt]s|tsx|jsx)$/;
const REGEX_BEFORE_PUNCT = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const REGEX_BEFORE_WORD = new Set([
  "return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await",
]);
const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[\w$]/;

/**
 * Split source into tokens. Returns the code with comments blanked out
 * (strings kept, line breaks kept) and the import specifiers found.
 */
export function scanSource(text) {
  const tokens = [];
  let code = "";
  let i = 0;
  const n = text.length;

  const blank = (from, to) => {
    for (let k = from; k < to; k++) code += text[k] === "\n" || text[k] === "\r" ? text[k] : " ";
  };

  const skipString = (start) => {
    const quote = text[start];
    let k = start + 1;
    while (k < n && text[k] !== quote && text[k] !== "\n") {
      k += text[k] === "\\" ? 2 : 1;
    }
    return Math.min(k + 1, n);
  };

  const skipTemplate = (start) => {
    let k = start + 1;
    while (k < n && text[k] !== "`") {
      if (text[k] === "\\") {
        k += 2;
      } else if (text[k] === "$" && text[k + 1] === "{") {
        let depth = 1;
        k += 2;
        while (k < n && depth > 0) {
          const c = text[k];
          if (c === "'" || c === '"') k = skipString(k);
          else if (c === "`") k = skipTemplate(k);
          else {
            if (c === "{") depth += 1;
            else if (c === "}") depth -= 1;
            k += 1;
          }
        }
      } else {
        k += 1;
      }
    }
    return Math.min(k + 1, n);
  };

  const regexAllowed = () => {
    const prev = tokens[tokens.length - 1];
    if (prev === undefined) return true;
    if (prev.type === "punct") return REGEX_BEFORE_PUNCT.has(prev.value);
    if (prev.type === "ident") return REGEX_BEFORE_WORD.has(prev.value);
    return false;
  };

  const skipRegex = (start) => {
    let k = start + 1;
    let inClass = false;
    while (k < n && text[k] !== "\n") {
      const c = text[k];
      if (c === "\\") k += 2;
      else if (c === "[") {
        inClass = true;
        k += 1;
      } else if (c === "]") {
        inClass = false;
        k += 1;
      } else if (c === "/" && !inClass) {
        k += 1;
        while (k < n && /[a-z]/i.test(text[k])) k += 1;
        return k;
      } else k += 1;
    }
    return -1;
  };

  while (i < n) {
    const c = text[i];
    if (/\s/.test(c)) {
      code += c;
      i += 1;
    } else if (c === "/" && text[i + 1] === "/") {
      let end = i;
      while (end < n && text[end] !== "\n") end += 1;
      blank(i, end);
      i = end;
    } else if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      blank(i, end);
      i = end;
    } else if (c === "'" || c === '"') {
      const end = skipString(i);
      tokens.push({ type: "string", value: text.slice(i + 1, end - 1) });
      code += text.slice(i, end);
      i = end;
    } else if (c === "`") {
      const end = skipTemplate(i);
      tokens.push({ type: "template", value: "" });
      code += text.slice(i, end);
      i = end;
    } else if (IDENT_START.test(c)) {
      let end = i + 1;
      while (end < n && IDENT_PART.test(text[end])) end += 1;
      tokens.push({ type: "ident", value: text.slice(i, end) });
      code += text.slice(i, end);
      i = end;
    } else if (/[0-9]/.test(c)) {
      let end = i + 1;
      while (end < n && /[\w.]/.test(text[end])) end += 1;
      tokens.push({ type: "number", value: text.slice(i, end) });
      code += text.slice(i, end);
      i = end;
    } else if (c === "/" && regexAllowed()) {
      const end = skipRegex(i);
      if (end === -1) {
        tokens.push({ type: "punct", value: c });
        code += c;
        i += 1;
      } else {
        tokens.push({ type: "regex", value: "" });
        code += text.slice(i, end);
        i = end;
      }
    } else {
      tokens.push({ type: "punct", value: c });
      code += c;
      i += 1;
    }
  }

  return { code, imports: readImports(tokens) };
}

function readImports(tokens) {
  const found = [];
  const isPunct = (t, v) => t !== undefined && t.type === "punct" && t.value === v;
  const isIdent = (t, v) => t !== undefined && t.type === "ident" && t.value === v;

  // Walk forward to the string that follows `from`. Stop at `;`, `=` or `(`.
  const walkToFrom = (start) => {
    for (let k = start; k < tokens.length && k < start + 500; k++) {
      const t = tokens[k];
      if (t.type === "string") return isIdent(tokens[k - 1], "from") ? t.value : undefined;
      if (isPunct(t, ";") || isPunct(t, "=") || isPunct(t, "(")) return undefined;
    }
    return undefined;
  };

  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== "ident") continue;
    const next = tokens[k + 1];
    if (t.value === "import") {
      if (next === undefined) continue;
      if (next.type === "string") found.push(next.value);
      else if (isPunct(next, "(")) {
        if (tokens[k + 2]?.type === "string") found.push(tokens[k + 2].value);
      } else if (isPunct(next, ".")) {
        // import.meta
      } else {
        const spec = walkToFrom(k + 1);
        if (spec !== undefined) found.push(spec);
      }
    } else if (t.value === "export") {
      const target = isIdent(next, "type") ? tokens[k + 2] : next;
      if (isPunct(target, "{") || isPunct(target, "*")) {
        const spec = walkToFrom(k + 1);
        if (spec !== undefined) found.push(spec);
      }
    } else if (t.value === "require" && isPunct(next, "(") && tokens[k + 2]?.type === "string") {
      found.push(tokens[k + 2].value);
    }
  }
  return found;
}

/** Source files under `root`, as sorted paths with forward slashes, relative to `root`. */
export function walkSourceFiles(root) {
  const files = [];
  const visit = (dirRel) => {
    const abs = join(root, dirRel);
    for (const name of readdirSync(abs)) {
      if (SKIP_DIRS.has(name)) continue;
      const rel = dirRel === "" ? name : `${dirRel}/${name}`;
      const stat = statSync(join(root, rel));
      if (stat.isDirectory()) visit(rel);
      else if (SOURCE_FILE.test(name)) files.push(rel);
    }
  };
  visit("");
  return files.sort();
}

/**
 * Describe an import. A relative specifier resolves to a path relative to the
 * root. A bare one gives its package name.
 */
export function resolveImport(fileRel, spec) {
  if (spec.startsWith(".")) {
    return { kind: "relative", target: posix.normalize(posix.join(posix.dirname(fileRel), spec)) };
  }
  if (spec.startsWith("node:")) return { kind: "bare", pkg: spec };
  const parts = spec.split("/");
  const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return { kind: "bare", pkg };
}
