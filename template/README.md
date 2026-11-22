# Template

The plot foundation that both registers are built on. It holds identity, plot codes, dates, status, events, local storage, the privacy types and the adapter contract. It knows no app.

## Layers

| Folder | Holds | May import |
|---|---|---|
| `src/*.ts`, `src/map/` | Pure rules | Each other and Zod |
| `src/data/` | IndexedDB, Blob | The pure rules, Zod |
| `src/output/`, `src/exchange/` | Visitor and committee files | `calendar`, `limits`, `map/*`, Zod |
| `src/ui/` | Screens and words | Everything above, React |

The template never imports an app, the site, the Desk or a test helper. `node scripts/check-imports.mjs` checks this.

## An app brings

An adapter (see `src/adapter.ts`): a kind, field definitions, command names, `validate`, `decide`, `apply`, `project`, reports, review facts, labels and theme.
