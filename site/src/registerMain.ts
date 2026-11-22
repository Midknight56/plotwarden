// The script that the assembled site adds to each of its own pages: `/sw-register.js`. It registers the worker
// and shows the update notice. Nothing here runs in a dev server or in a build of one app on its own.
import { registerShell } from "./swRegister";
import type { NoticeDocument } from "./swRegister";

void registerShell(navigator as unknown as Parameters<typeof registerShell>[0], document as unknown as NoticeDocument);
