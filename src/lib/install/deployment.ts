import fs from "fs";
import os from "os";

/**
 * Web Installer — deployment-mode detection, and the architectural reality
 * it exists to state honestly.
 *
 * ─── THE UNCOMFORTABLE TRUTH THIS MODULE REFUSES TO PAPER OVER ──────────
 * A web installer's most natural-seeming feature is "type your SMTP details
 * here and we'll save them". In this stack that feature is a lie in two
 * different ways, and both have to be said out loud rather than designed
 * around:
 *
 * 1. WRITING `.env` DOES NOT RELOAD `process.env`.
 *    Next.js reads `.env` once, at process start. Writing new values to that
 *    file at runtime changes the FILE and changes NOTHING about the running
 *    server: `process.env.EMAIL_HOST` keeps its old value (or stays
 *    undefined) until the process restarts. An installer that writes `.env`
 *    and then reports "SMTP configured ✓" is reporting on a file it just
 *    wrote, not on the running system — it would be fabricating a result
 *    (Section 77). Worse, some values are not even runtime values:
 *    `NEXT_PUBLIC_APP_URL` is inlined into the client bundle AT BUILD TIME
 *    (see the Dockerfile's `--build-arg`), so no restart fixes it either —
 *    it needs a rebuild.
 *
 * 2. IN A CONTAINER, A `.env` WRITTEN INSIDE THE CONTAINER IS EPHEMERAL.
 *    The container filesystem is disposable by design. Anything the
 *    installer writes to `/app/.env` is destroyed by the next `docker
 *    compose up --force-recreate`, the next image build, the next node
 *    reschedule. Writing it would produce configuration that appears to work
 *    and then silently vanishes at the least convenient moment — the exact
 *    failure mode this product's honesty rules exist to prevent.
 *
 * ─── WHAT THE INSTALLER DOES INSTEAD, PER MODE ──────────────────────────
 *   traditional (VPS / bare metal / systemd / pm2):
 *     Writing `.env` is legitimate and durable. But the installer must say
 *     plainly that A RESTART IS REQUIRED, must not claim the value is active
 *     until it has RE-CHECKED after that restart, and must never write the
 *     file anywhere reachable over HTTP (never into `public/` or any static
 *     directory) — an `.env` served as a static asset is a total compromise.
 *
 *   container (Docker / Compose / Kubernetes):
 *     The installer does NOT pretend to persist anything. It shows the exact
 *     environment variables to inject — a compose snippet or `-e` flags —
 *     because injection at the orchestrator level is the only thing that
 *     actually survives a redeploy. Handing the operator the correct snippet
 *     is a real, complete answer; writing a file that will be deleted is not.
 *
 * Stage 1 performs no writes at all. This module supplies the DETECTION and
 * the GUIDANCE TEXT that Stage 2's write actions must obey.
 */

export type DeploymentMode = "container" | "traditional" | "unknown";

export interface DeploymentDetection {
  mode: DeploymentMode;
  /** Human-readable evidence for the verdict. Never a bare boolean. */
  evidence: string[];
  /** Container flavour, when detectable ("kubernetes" | "docker"). */
  orchestrator?: string;
  /**
   * True when writing `.env` on this host is a durable, legitimate action.
   * False in containers — where the installer must show env vars instead.
   */
  envFileIsDurable: boolean;
  /**
   * True when a process restart is needed for newly written values to take
   * effect. Always true where an `.env` write is possible at all, because
   * `process.env` is not re-read at runtime.
   */
  restartRequired: boolean;
  platform: string;
}

/**
 * Best-effort, evidence-first detection. Deliberately returns `unknown`
 * rather than guessing when nothing conclusive is found — telling an
 * operator "we could not tell, here is guidance for both" is honest;
 * defaulting to "traditional" and writing an ephemeral `.env` is not.
 */
export function detectDeploymentMode(
  env: NodeJS.ProcessEnv = process.env,
  fsImpl: { existsSync(p: string): boolean; readFileSync(p: string, e: "utf8"): string } = fs,
  platform: string = process.platform
): DeploymentDetection {
  const evidence: string[] = [];
  let orchestrator: string | undefined;
  let container = false;

  if (env.KUBERNETES_SERVICE_HOST) {
    container = true;
    orchestrator = "kubernetes";
    evidence.push("KUBERNETES_SERVICE_HOST is set (running inside a Kubernetes pod).");
  }

  try {
    if (fsImpl.existsSync("/.dockerenv")) {
      container = true;
      orchestrator = orchestrator ?? "docker";
      evidence.push("/.dockerenv exists (Docker creates this file inside every container).");
    }
  } catch {
    /* ignore — probing must never throw */
  }

  try {
    if (fsImpl.existsSync("/proc/1/cgroup")) {
      const cgroup = fsImpl.readFileSync("/proc/1/cgroup", "utf8");
      if (/docker|containerd|kubepods|podman|lxc/i.test(cgroup)) {
        container = true;
        orchestrator = orchestrator ?? (/kubepods/i.test(cgroup) ? "kubernetes" : "docker");
        evidence.push("PID 1's cgroup path names a container runtime.");
      }
    }
  } catch {
    /* ignore */
  }

  if (!container && env.container) {
    container = true;
    orchestrator = orchestrator ?? String(env.container);
    evidence.push(`The 'container' environment variable is set to '${env.container}'.`);
  }

  if (container) {
    return {
      mode: "container",
      evidence,
      orchestrator,
      envFileIsDurable: false,
      restartRequired: true,
      platform,
    };
  }

  if (platform === "win32" || platform === "darwin") {
    evidence.push(
      `Platform is ${platform} and no container markers were found — containers on this platform run inside a Linux VM, so this process is not in one.`
    );
    return {
      mode: "traditional",
      evidence,
      envFileIsDurable: true,
      restartRequired: true,
      platform,
    };
  }

  if (platform === "linux") {
    evidence.push(
      "Linux host with no container markers (/.dockerenv absent, PID 1 cgroup names no runtime) — treated as a traditional VPS/bare-metal host."
    );
    return {
      mode: "traditional",
      evidence,
      envFileIsDurable: true,
      restartRequired: true,
      platform,
    };
  }

  evidence.push(`Unrecognised platform '${platform}'; no container markers found either.`);
  return {
    mode: "unknown",
    evidence,
    // Fail closed: if we cannot tell, do NOT claim a file write will persist.
    envFileIsDurable: false,
    restartRequired: true,
    platform,
  };
}

/**
 * Build the operator-facing guidance for applying configuration values,
 * correct for the detected mode. Takes variable NAMES only — never values —
 * so this function is structurally incapable of leaking a secret into a
 * response body or a docs page.
 */
export function renderConfigGuidance(
  detection: DeploymentDetection,
  variableNames: string[]
): { headline: string; steps: string[]; snippet?: string } {
  const names = variableNames.length > 0 ? variableNames : ["<VARIABLE_NAME>"];

  if (detection.mode === "container") {
    const composeSnippet = [
      "services:",
      "  app:",
      "    environment:",
      ...names.map((n) => `      ${n}: "<value>"`),
    ].join("\n");
    return {
      headline:
        "Containerised deployment detected — configuration must be injected by the orchestrator, not written to a file.",
      steps: [
        "Add the variables below to your compose file's `environment:` block (or pass them as `-e NAME=value` flags to `docker run`, or as a Secret/ConfigMap in Kubernetes).",
        "Recreate the container so the new environment is applied: `docker compose up -d --force-recreate app`.",
        "Re-run these checks afterwards — this installer will not report a value as active until it has actually observed it in the running process.",
        "NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD time. Changing those requires rebuilding the image with `--build-arg`, not just restarting the container.",
        "The installer deliberately does not write a .env file inside the container: it would be erased by the next redeploy, so it would create configuration that appears to work and then silently disappears.",
      ],
      snippet: composeSnippet,
    };
  }

  const steps = [
    "Add or update these variables in the `.env` file in the application's project root.",
    "A RESTART IS REQUIRED. Next.js reads `.env` once at process start; writing the file changes nothing about the running server until it restarts (`systemctl restart <service>` / `pm2 restart <app>`).",
    "After restarting, re-run these checks. This installer reports a value as active only after observing it in the running process — never merely because it was written.",
    "NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD time, so those additionally require `pnpm run build` before the restart.",
    "Keep `.env` in the project root and out of any public/static directory, and never serve it over HTTP.",
  ];

  if (detection.mode === "unknown") {
    steps.unshift(
      "The deployment type could not be determined, so no assumption is made that writing a file will persist. If this instance runs in a container, inject these as environment variables through your orchestrator instead."
    );
  }

  return {
    headline:
      detection.mode === "traditional"
        ? "Traditional (VPS / bare-metal) deployment detected — writing `.env` is durable here, but only takes effect after a restart."
        : "Deployment type could not be determined — follow whichever of these applies to your host.",
    steps,
    snippet: names.map((n) => `${n}=<value>`).join("\n"),
  };
}

/** Total physical memory in bytes, via `os.totalmem()`. */
export function getTotalMemoryBytes(): number {
  return os.totalmem();
}
