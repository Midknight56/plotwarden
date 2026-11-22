# Third party notices

Plotwarden is MIT licensed (see `LICENSE`). It uses the packages below. Each is pinned to an exact version in `package.json` and `package-lock.json`. Licences were read from each package's own `package.json` at install time. The lockfile lists every indirect package.

## Runtime

| Package | Version | Licence | Use |
|---|---|---|---|
| zod | 4.6.7 | MIT | Closed schemas for visitor files |

## Development and test only

None of these ship in a built app.

| Package | Version | Licence | Use |
|---|---|---|---|
| typescript | 6.0.3 | Apache-2.0 | Type checking |
| vite | 8.3.8 | MIT | Dev and preview server, build |
| vitest | 5.1.1 | MIT | Unit, property, conformance and oracle tests |
| fast-check | 4.11.0 | MIT | Generated property tests |
| fake-indexeddb | 6.2.8 | Apache-2.0 | IndexedDB in tests |
| @playwright/test | 1.65.1 | Apache-2.0 | Browser tests, headless |
| eslint | 10.15.0 | MIT | Lint |
| @eslint/js | 10.0.1 | MIT | Lint rules |
| typescript-eslint | 8.73.0 | MIT | Lint for TypeScript |
| @types/node | 26.6.6 | MIT | Node types for tests and scripts |
| @axe-core/playwright | 4.14.0 | MPL-2.0 | Accessibility checks in the browser specs |
| axe-core | 4.14.1 (installed by @axe-core/playwright) | MPL-2.0 | The accessibility rules that those checks run |

axe-core and its Playwright wrapper are used only by the browser specs, from `node_modules`. No file of theirs is copied into this repository or into a built app. Their licence is the Mozilla Public License 2.0.

Python is used only through its standard library, in `scripts/oracle.py`.

Packages for CSV (Papa Parse), archives (fflate), React and axe-core are added by the specs that use them, and listed here when they are.
