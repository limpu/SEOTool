import { readInstallationState } from "@/lib/install/state";
import { ensureInstallToken } from "@/lib/install/token";

/**
 * Web Installer — Node-runtime boot work, imported only from
 * `instrumentation.ts` behind a `NEXT_RUNTIME === "nodejs"` guard.
 *
 * WHY AT BOOT AND NOT ON FIRST REQUEST: a Docker operator's only retrieval
 * path for the install token is `docker logs`, and they need it BEFORE they
 * open `/install`. Generating it lazily on the first request would mean the
 * token is printed only after someone has already hit the installer — which
 * is exactly the ordering a scanner racing the operator would win.
 * Generating at boot means the operator holds the token from the moment the
 * container starts.
 *
 * DELIBERATELY SILENT ONCE COMPLETE: no token is generated, nothing is
 * written, nothing is logged. A live production system must not print an
 * install token into its logs on every restart.
 */
async function bootstrapInstaller() {
  try {
    const state = await readInstallationState();
    if (state.status === "complete") return;

    // `not_complete` and `unknown` both reach here. Generating a token while
    // the database is unreachable is safe: the token unlocks nothing on its
    // own — completing an installation additionally requires an authoritative
    // "not complete" from the database, which an unreachable database cannot
    // give. Skipping generation instead would leave an operator whose
    // database is down with no way into the very tool built to diagnose that.
    await ensureInstallToken();
  } catch {
    // Boot must never fail because of the installer. A failure here only
    // means the operator reads the token from the .install-token file rather
    // than from the log; it can never take the application down.
  }
}

await bootstrapInstaller();
