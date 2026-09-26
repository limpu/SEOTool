import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { runAllChecks } from "@/lib/install/checks";
import { resolveRequestProtocol } from "@/lib/install/checks/network";
import { evaluateCompletionGate } from "@/lib/install/actions/complete";
import { expectedRedirectUris } from "@/lib/install/actions/google";
import { isInstallerActionPermitted, readInstallationState } from "@/lib/install/state";
import { INSTALL_TOKEN_COOKIE, verifyInstallToken } from "@/lib/install/token";
import { deriveWizardModel } from "@/lib/install/wizard-steps";
import { TokenGate } from "./_components/token-gate";
import { Wizard } from "./_components/wizard";

/**
 * Web Installer — the wizard page.
 *
 * A Server Component does the fetching; the interactive parts are thin
 * `"use client"` leaves beneath it. That split is not stylistic here — it is
 * why the install token can live in an httpOnly cookie and never appear in
 * page JavaScript at all.
 *
 * The two refusals, in Stage 1's order:
 *
 *   1. THE LOCK, FIRST. Once installation is complete this page calls
 *      `notFound()` — a genuine 404, the same as the API routes. Not a
 *      "already installed" screen, which would confirm to anyone who wandered
 *      past that this deployment has an installer, useful intelligence for
 *      somebody waiting on a redeploy or a restore-from-backup.
 *   2. THE TOKEN, SECOND. Without a valid one the page renders the token
 *      gate and nothing else — no check results, no environment listing, no
 *      hint of what is configured.
 *
 * While the database is unreachable the page still renders (capability
 * `read`), because diagnosing exactly that is one of the installer's main
 * jobs. Every mutation behind it independently fails closed with 503.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InstallPage() {
  const state = await readInstallationState();
  const permission = isInstallerActionPermitted(state.status, "read");
  if (!permission.permitted) notFound();

  const cookieStore = await cookies();
  const token = cookieStore.get(INSTALL_TOKEN_COOKIE)?.value ?? null;
  const authorised = await verifyInstallToken(token);

  if (!authorised) {
    return <TokenGate tokenFilePresent={await tokenFileExists()} />;
  }

  const headerList = await headers();
  const { protocol } = resolveRequestProtocol(headerList);
  const host = headerList.get("host");

  const report = await runAllChecks({
    requestProtocol: protocol,
    requestHost: host ?? undefined,
    projectRoot: process.cwd(),
  });
  const gate = evaluateCompletionGate(report);
  const model = deriveWizardModel(report, gate.allowed);
  const redirectUris = expectedRedirectUris(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || (host ? `${protocol}://${host}` : undefined)
  );

  return (
    <Wizard
      initial={{
        report,
        model,
        gate,
        redirectUris,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      }}
    />
  );
}

/**
 * Whether `.install-token` exists, so the gate can tell an operator whether
 * to look in the file or in the container's logs. It is a boolean and never
 * the path or the value — the token itself must not reach the browser except
 * by the operator typing it.
 */
async function tokenFileExists(): Promise<boolean> {
  const fs = await import("fs/promises");
  const { getInstallTokenPath } = await import("@/lib/install/token");
  try {
    await fs.access(getInstallTokenPath(process.cwd()));
    return true;
  } catch {
    return false;
  }
}
