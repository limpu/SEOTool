"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CopyButton } from "@/components/report/copy-button";
import type { SectionId } from "@/lib/install/wizard-steps";
import { CheckList } from "./check-card";
import { SectionStatusBadge } from "./status-badge";
import { installerGet } from "./api";
import type { WizardData } from "./wizard-data";
import {
  AdminPanel,
  AiPanel,
  CompletePanel,
  EmailPanel,
  EnvWriterPanel,
  GooglePanel,
  MigrationsPanel,
  SecretsPanel,
} from "./panels";

/**
 * The wizard shell.
 *
 * ─── IT IS A MATRIX, NOT A FORM ─────────────────────────────────────────
 * There is no "step 4 of 11" here, because that number would be a claim the
 * installer cannot back up. Every section's status is computed from the live
 * check matrix on every render, and "next" is simply the first section that
 * genuinely needs a human. A section with nothing to do renders as
 * already-satisfied and collapsed — never hidden, so the operator can always
 * open it and see what was measured.
 *
 * ─── IT RE-MEASURES, IT DOES NOT REMEMBER ───────────────────────────────
 * After any write, `refresh()` re-fetches `/api/install/wizard` and the whole
 * model is rebuilt. No panel turns its own section green. That is the rule
 * the entire installer is built on: writing `.env` does not reload
 * `process.env`, so a write is a claim and only a re-check is evidence.
 *
 * ─── RESUMABILITY IS SERVER-SIDE ────────────────────────────────────────
 * "Continue Setup" comes from the durable step record in the database, not
 * from `localStorage`. A client-side flag would make the label a lie on a
 * different browser — and, more seriously, a client-side notion of progress
 * is exactly the kind of thing that must never influence what the installer
 * is willing to do.
 */
export function Wizard({ initial }: { initial: WizardData }) {
  const [data, setData] = useState<WizardData>(initial);
  const [active, setActive] = useState<SectionId>(initial.model.nextSectionId);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [adminAccount, setAdminAccount] = useState<{
    userId: string;
    email: string;
    name: string;
  } | null>(null);
  const [finished, setFinished] = useState<{ message: string; notes?: string[] } | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    const res = await installerGet<WizardData & { error?: string }>("/api/install/wizard");
    setRefreshing(false);
    if (!res.ok || !res.data?.model) {
      setRefreshError(
        res.data?.error ?? "The checks could not be re-run. The application may have restarted."
      );
      return;
    }
    setData({
      report: res.data.report,
      model: res.data.model,
      gate: res.data.gate,
      redirectUris: res.data.redirectUris,
      appUrl: res.data.appUrl,
    });
  }, []);

  if (finished) {
    return (
      <CompletionScreen
        message={finished.message}
        notes={finished.notes}
        adminAccount={adminAccount}
        appUrl={data.appUrl}
      />
    );
  }

  const section = data.model.sections.find((s) => s.id === active) ?? data.model.sections[0];
  const summary = data.report.summary;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">
          {data.model.resuming ? "Continue setup" : "Install the AI SEO Platform"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-secondary-foreground">
          {data.model.resuming
            ? "This installation was started earlier. Everything already satisfied is marked Ready — pick up wherever the checks say work remains."
            : "Nothing here is a fixed sequence. Each section reports what was actually measured on this server, and anything already configured is marked Ready and can be skipped."}
        </p>
        <p className="mt-2 text-xs text-secondary-foreground">
          {summary.pass} ready · {summary.warn} needing attention · {summary.fail} failed ·{" "}
          {summary.optional} optional · {summary.unknown} not measured. Last checked{" "}
          {new Date(data.report.generatedAt).toLocaleTimeString()}.
        </p>
      </header>

      {data.report.installation.status === "unknown" && (
        <div className="mb-5">
          <Alert variant="error">
            <p className="font-semibold">The database cannot be reached right now.</p>
            <p className="mt-1">
              {data.report.installation.reason} Read-only checks still work, because diagnosing this
              is one of the installer&apos;s main jobs — but nothing can be changed until the
              database answers. An unconfirmed installation state is never treated as &ldquo;not
              installed&rdquo;.
            </p>
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Installation sections">
          <ol className="space-y-1">
            {data.model.sections.map((s) => {
              const isActive = s.id === section.id;
              const isNext = s.id === data.model.nextSectionId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActive(s.id)}
                    aria-current={isActive ? "step" : undefined}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      isActive
                        ? "border-strong bg-surface"
                        : "border-transparent hover:bg-surface-hover"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {s.label}
                      </span>
                      {isNext && !isActive && (
                        <span className="block text-xs text-secondary-foreground">Next</span>
                      )}
                    </span>
                    <SectionStatusBadge status={s.status} />
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 space-y-2">
            <Button
              type="button"
              variant="secondary"
              onClick={refresh}
              loading={refreshing}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Re-run all checks
            </Button>
            {refreshError && <Alert variant="error">{refreshError}</Alert>}
          </div>
        </nav>

        <div className="min-w-0">
          <Card>
            <CardHeader action={<SectionStatusBadge status={section.status} />}>
              <CardTitle>{section.label}</CardTitle>
              <CardDescription>{section.blurb}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-secondary-foreground">{section.reason}</p>

              <SectionBody
                sectionId={section.id}
                data={data}
                refresh={refresh}
                adminAccount={adminAccount}
                onAdminCreated={(a) => {
                  setAdminAccount(a);
                  void refresh();
                }}
                onCompleted={(payload) =>
                  setFinished({
                    message: payload.message ?? "Installation complete.",
                    notes: payload.notes,
                  })
                }
              />

              {section.checks.length > 0 && (
                <details open={!section.satisfied} className="border-t border-default pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    What was measured ({section.checks.length})
                  </summary>
                  <div className="mt-3">
                    <CheckList checks={section.checks} />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function SectionBody({
  sectionId,
  data,
  refresh,
  adminAccount,
  onAdminCreated,
  onCompleted,
}: {
  sectionId: SectionId;
  data: WizardData;
  refresh: () => void;
  adminAccount: { userId: string; email: string; name: string } | null;
  onAdminCreated: (a: { userId: string; email: string; name: string }) => void;
  onCompleted: (payload: { message?: string; notes?: string[] }) => void;
}) {
  switch (sectionId) {
    case "welcome":
      return <WelcomePanel data={data} />;

    case "server":
      return (
        <p className="text-sm text-secondary-foreground">
          Nothing to configure here — this is what was measured on the machine the application is
          running on. Below-recommended memory or a missing Chromium is reported as{" "}
          <strong>Action Required</strong>, never as a blocker: this product runs on modest
          hardware, and refusing to install over a hardware recommendation would be asserting a
          requirement it does not have.
        </p>
      );

    case "environment":
      return (
        <div className="space-y-6">
          <SecretsPanel data={data} />
          <div className="border-t border-default pt-5">
            <p className="text-sm font-semibold text-foreground">Save configuration values</p>
            <p className="mt-1 mb-4 text-xs text-secondary-foreground">
              {data.report.deployment.envFileIsDurable
                ? "These are written to .env in the project root, atomically, preserving every comment and unrelated line. They do NOT take effect until the application restarts."
                : "This instance is containerised, so nothing is written to a file — the values to inject are rendered for you instead."}
            </p>
            <EnvWriterPanel
              data={data}
              onSaved={refresh}
              fields={[
                { name: "DATABASE_URL", label: "DATABASE_URL", type: "password", placeholder: "postgresql://user:password@host:5432/database" },
                { name: "NEXT_PUBLIC_APP_URL", label: "NEXT_PUBLIC_APP_URL", hint: "The address users reach this platform at. Inlined at BUILD time — needs a rebuild, not just a restart." },
                { name: "JWT_SECRET", label: "JWT_SECRET", type: "password", hint: "Paste a value generated above." },
                { name: "GSC_TOKEN_ENCRYPTION_KEY", label: "GSC_TOKEN_ENCRYPTION_KEY", type: "password" },
                { name: "GA4_TOKEN_ENCRYPTION_KEY", label: "GA4_TOKEN_ENCRYPTION_KEY", type: "password" },
                { name: "SESSION_DURATION_SECONDS", label: "SESSION_DURATION_SECONDS", hint: "Optional. Defaults to 7 days." },
              ]}
            />
          </div>
        </div>
      );

    case "database":
      return (
        <div className="space-y-6">
          <EnvWriterPanel
            data={data}
            onSaved={refresh}
            fields={[
              {
                name: "DATABASE_URL",
                label: "DATABASE_URL",
                type: "password",
                placeholder: "postgresql://user:password@host:5432/database",
                hint: "Only the password is ever hidden from the diagnostics — the user, host, port and database name are shown, because that is what a connection failure is diagnosed from.",
              },
            ]}
          />
          <div className="border-t border-default pt-5">
            <MigrationsPanel onDone={refresh} />
          </div>
        </div>
      );

    case "google":
      return <GooglePanel data={data} onSaved={refresh} />;

    case "email":
      return <EmailPanel data={data} onSaved={refresh} />;

    case "ai":
      return <AiPanel data={data} onSaved={refresh} />;

    case "admin":
      return <AdminPanel data={data} onCreated={onAdminCreated} />;

    case "security":
      return (
        <div className="space-y-5">
          <p className="text-sm text-secondary-foreground">
            Generate any secret that is missing or weak below. In production, plain HTTP is a hard
            blocker for two concrete reasons: the administrator password would cross the network in
            clear text, and the session cookie is issued <code className="font-mono text-xs">secure</code>{" "}
            in production, so nobody could stay signed in even if the password arrived safely.
          </p>
          <SecretsPanel data={data} />
        </div>
      );

    case "final":
      return (
        <div className="space-y-4">
          {data.gate.blockers.length > 0 ? (
            <>
              <Alert variant="error">
                <p className="font-semibold">{data.gate.reason}</p>
              </Alert>
              <CheckList checks={data.gate.blockers} />
            </>
          ) : (
            <Alert variant="success">
              <p className="font-semibold">{data.gate.reason}</p>
            </Alert>
          )}

          {data.gate.warnings.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground">
                Not blocking, but worth seeing before the installer closes
              </p>
              <p className="mt-1 mb-3 text-xs text-secondary-foreground">
                None of these prevents installation. They are shown here rather than buried under a
                success banner, because after completion this screen no longer exists.
              </p>
              <CheckList checks={data.gate.warnings} />
            </div>
          )}
        </div>
      );

    case "complete":
      return (
        <CompletePanel data={data} adminAccount={adminAccount} onCompleted={onCompleted} />
      );

    default:
      return null;
  }
}

function WelcomePanel({ data }: { data: WizardData }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-secondary-foreground">
      <p>
        This installer configures the platform and creates the first administrator account. It runs
        on the server you deployed, reads what is actually there, and tells you what is missing —
        it never reports something as working because a value was typed into a form.
      </p>

      <div>
        <p className="font-semibold text-foreground">What it will do</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>Generate strong secrets, and show each one once.</li>
          <li>
            {data.report.deployment.envFileIsDurable
              ? "Write configuration to .env, preserving your comments — and tell you plainly that a restart is required before it takes effect."
              : "Render the exact environment variables to inject through your orchestrator. It will not write a file inside a container, because that file is erased by the next redeploy."}
          </li>
          <li>Apply pending database migrations, in order, stopping at the first failure.</li>
          <li>Create the first SUPER_ADMIN, and verify the role really landed.</li>
          <li>Send a real test email and run a real AI completion, if you configure those.</li>
        </ul>
      </div>

      <div>
        <p className="font-semibold text-foreground">What it will never do</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>Drop, truncate or reset anything to get past a problem.</li>
          <li>Create a second administrator, or modify an existing one.</li>
          <li>
            Replace a secret that is already set without an explicit confirmation naming that exact
            variable — rotating a token-encryption key destroys stored Google connections
            permanently.
          </li>
          <li>
            Start a Google OAuth handshake. Authorising Search Console and Analytics stays an
            explicit action you take after installation.
          </li>
          <li>Report a value as active merely because it was written.</li>
        </ul>
      </div>

      <p>
        Detected deployment: <strong>{data.report.deployment.mode}</strong> on{" "}
        {data.report.deployment.platform}. {data.report.deployment.evidence.join(" ")}
      </p>
    </div>
  );
}

/**
 * The completion screen.
 *
 * It shows the login URL and the administrator's EMAIL. It does not show the
 * password and structurally cannot: the plaintext was used to compute a
 * bcrypt hash and then discarded — the server kept no copy, and no response
 * on the way here carried one.
 */
function CompletionScreen({
  message,
  notes,
  adminAccount,
  appUrl,
}: {
  message: string;
  notes?: string[];
  adminAccount: { userId: string; email: string; name: string } | null;
  appUrl: string | null;
}) {
  const base = (appUrl ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/+$/,
    ""
  );
  const loginUrl = `${base}/login`;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-status-good-subtle">
            <CheckCircle2 className="h-5 w-5 text-status-good" aria-hidden="true" />
          </span>
          <CardTitle>Installation complete</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-md border border-default bg-surface-subtle px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Sign in at</p>
              <CopyButton value={loginUrl} label="Copy the login URL" />
            </div>
            <code className="mt-1.5 block break-all font-mono text-xs text-foreground">
              {loginUrl}
            </code>
          </div>

          {adminAccount && (
            <div className="rounded-md border border-default bg-surface-subtle px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">Administrator email</p>
                <CopyButton value={adminAccount.email} label="Copy the administrator email" />
              </div>
              <code className="mt-1.5 block break-all font-mono text-xs text-foreground">
                {adminAccount.email}
              </code>
            </div>
          )}

          <Alert variant="info">
            The password is not shown here, and cannot be. It was hashed and discarded — nothing on
            this server kept a readable copy. If it has been lost, use the password-reset flow on
            the sign-in page.
          </Alert>

          {notes && notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-secondary-foreground">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          <p className="text-xs text-secondary-foreground">
            This page is the last thing the installer will show you. Reloading{" "}
            <code className="font-mono">/install</code> now returns a 404 — not a message saying
            installation is finished, a genuine 404, so nobody scanning this host can learn that an
            installer was ever here.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
