---
inclusion: fileMatch
fileMatchPattern: ["template/**", "apps/**", "site/**", "tools/**", "scripts/**", "tests/**", "*.json", "*.ts", "*.mjs"]
---

# Repository structure and import direction

## Direction

```
apps/*  ->  template/  ->  browser primitives (IndexedDB, Blob, DOM)
site/   ->  apps/* entry points (links and static assembly only)
```

- An app imports the template. The template never imports an app, the site, the Desk or a test helper.
- `template/src/{types,commands,events,site,plot,status,calendar,queue,search,limits}.ts` and `template/src/map/*` are pure. They import no React, no IndexedDB and nothing from `apps/`.
- `template/src/data/*` may use IndexedDB and Blob. It imports no React and no app.
- `template/src/ui/*` may use React. It receives its adapter as an argument. Only the app entry point (`apps/<app>/src/main.tsx`) imports its own adapter and passes it to `RegisterShell`.
- No shared rule contains `if churchyard`, `if allotment`, `kind === "market"` or similar. Kind specific behaviour lives in the adapter.
- Public and committee models in `template/src/output/` and `template/src/exchange/` import no private record type. A private type is never an optional supertype of a visitor type.
- The Desk repository holds a pinned copy of `template/src/exchange/*`. The main repository never imports the Desk.
- `scripts/check-imports.mjs` enforces these rules in the build. A violation fails the build with the importing file and the forbidden target.

## Ownership

- Add a production file only when its responsibility and its test are listed in the matching spec under `.kiro/specs/`.
- Specs: `00-contracts`, `01-foundation`, `02-paper-and-map`, `03-churchyard`, `04-allotment`, `05-exchange`, `06-access-and-release`. Each has exactly `requirements.md`, `design.md`, `tasks.md`.
- Two honest adapters. Do not build a general form language.

## Local tooling

- npm with a committed `package-lock.json`. Every dependency pinned to an exact version.
- Vite dev and preview servers bind `127.0.0.1` with `strictPort: true`. Stop any server you start.
- Files are UTF-8 without a byte order mark, LF line endings.
