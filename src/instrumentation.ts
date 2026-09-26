/**
 * Next.js instrumentation hook — `register()` runs once per server instance,
 * at boot, and completes before the server handles its first request.
 *
 * Web Installer Stage 1 uses it for one job: if installation is NOT complete,
 * make sure an install token exists and print it to stdout exactly once. The
 * work itself lives in `./instrumentation-node`, following the documented
 * "importing runtime-specific code" pattern — Next.js calls `register` in
 * every runtime, and that module touches `fs` and `pg`, neither of which
 * exists in the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
