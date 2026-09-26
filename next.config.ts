import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Phase 34 (Production Readiness): `standalone` output produces a
  // self-contained `.next/standalone` server (a minimal `node_modules`
  // subset + a `server.js` entrypoint) instead of requiring the full
  // `node_modules` tree at runtime — this is what makes the Dockerfile's
  // slim runtime stage possible (COPY only .next/standalone + .next/static
  // + public, not the whole repo/node_modules). No effect on `next dev`.
  output: "standalone",
  // Phase 20 (PageSpeed): `lighthouse` and `chrome-launcher` are Node-only
  // (they shell out to a real Chrome process, use `fs`/`child_process`, and
  // are large) — they must run only in server code (API routes) and never
  // be traced into a client bundle. Keeping them external to the server
  // bundle avoids Next.js trying to bundle Lighthouse's own asset/locale
  // files, which are not meant to be webpack-processed.
  serverExternalPackages: ["lighthouse", "chrome-launcher"],
};

export default nextConfig;
