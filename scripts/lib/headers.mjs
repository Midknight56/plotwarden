// The `_headers` file of a static host: its rules, how a path is matched, and what a content policy may hold.
// Used by scripts/check-release.mjs and by the preview server of tools/site/previewPlugin.ts, so the file is read
// one way in both. Matching follows the host's documented form: `*` is a splat, `:name` is a placeholder.

/** Read the rules. A rule is a path line with indented `Name: value` lines under it. Comments start with `#`. */
export function parseHeaders(text) {
  const rules = [];
  let current;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      const at = line.indexOf(":");
      if (current !== undefined && at > 0) current.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    } else {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
    }
  }
  return rules;
}

/** Does a rule's path pattern match a request path? */
export function matches(pattern, path) {
  const source = pattern
    .split("*")
    .map((part) => part.split(/:[A-Za-z_]\w*/).map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]+"))
    .join(".*");
  return new RegExp(`^${source}$`).test(path);
}

/** Every rule that matches a path, in file order. */
export function rulesFor(path, rules) {
  return rules.filter((rule) => matches(rule.pattern, path));
}

/** The headers a path gets: the values of one name from several rules are joined with a comma, as the host does. */
export function headersFor(path, rules) {
  const merged = new Map();
  for (const rule of rulesFor(path, rules)) {
    for (const [name, value] of rule.headers) {
      const key = name.toLowerCase();
      const known = merged.get(key);
      merged.set(key, known === undefined ? { name, value } : { name: known.name, value: `${known.value}, ${value}` });
    }
  }
  return [...merged.values()].map(({ name, value }) => [name, value]);
}

/** The values of one header name among the rules that match a path. One entry for each rule that sets it. */
export function valuesOf(path, rules, name) {
  const wanted = name.toLowerCase();
  const found = [];
  for (const rule of rulesFor(path, rules)) {
    for (const [header, value] of rule.headers) if (header.toLowerCase() === wanted) found.push(value);
  }
  return found;
}

/** Split a content policy into directives: `{ "script-src": ["'self'"] }`. */
export function parsePolicy(policy) {
  const directives = {};
  for (const part of policy.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0) directives[tokens[0].toLowerCase()] = tokens.slice(1);
  }
  return directives;
}

/**
 * What is wrong with the content policy of a page of the site, one sentence each. A page may load from its own
 * origin only. Styles may be inline, because the print documents carry their own. Script may not.
 */
export function policyProblems(policy) {
  const problems = [];
  const directives = parsePolicy(policy);
  if (directives["default-src"] === undefined) problems.push("it has no default-src");
  if ((directives["script-src"] ?? directives["default-src"] ?? []).join(" ") !== "'self'") problems.push("script-src is not 'self' alone");
  for (const [name, values] of Object.entries(directives)) {
    for (const token of values) {
      const quoted = token.startsWith("'");
      if (quoted && !["'self'", "'none'", "'unsafe-inline'"].includes(token)) problems.push(`${name} holds ${token}`);
      else if (token === "'unsafe-inline'" && name !== "style-src") problems.push(`${name} holds 'unsafe-inline'`);
      else if (!quoted && !["data:", "blob:"].includes(token)) problems.push(`${name} holds ${token}, an origin or a wildcard`);
      else if ((token === "data:" || token === "blob:") && !["img-src", "font-src", "media-src"].includes(name)) problems.push(`${name} holds ${token}`);
    }
  }
  return problems;
}
