"use client";

import { useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/report/copy-button";
import type { CheckResult } from "@/lib/install/types";
import { errorMessage, installerPost } from "./api";
import type { WizardData } from "./wizard-data";

/**
 * The interactive panels — one per wizard section that has something for a
 * human to do. Everything else on the screen is the check matrix, which is a
 * report and needs no client JavaScript.
 *
 * Every panel obeys the same two rules:
 *
 *   1. IT NEVER CLAIMS SUCCESS IT DID NOT MEASURE. A write returns "written,
 *      restart required" and then the wizard RE-RUNS THE CHECKS. No panel
 *      turns a section green off the back of its own request.
 *   2. IT SHOWS THE SERVER'S OWN REMEDIATION. `howToFix` arrays come back from
 *      the API already written in plain language; the panels render them, they
 *      do not paraphrase them.
 */

function Notes({ items, title }: { items?: string[]; title?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3 rounded-md bg-surface-subtle px-3 py-2.5">
      {title && <p className="text-xs font-semibold text-foreground">{title}</p>}
      <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-secondary-foreground">
        {items.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <Input id={id} {...rest} />
      {hint && <p className="mt-1 text-xs text-secondary-foreground">{hint}</p>}
    </div>
  );
}

/** A value the operator must copy out — shown once, never stored. */
function CopyableValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 rounded-md border border-default bg-surface-subtle px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <CopyButton value={value} label={`Copy ${label}`} />
      </div>
      <code className="mt-1.5 block break-all font-mono text-xs text-foreground">{value}</code>
    </div>
  );
}

// ─── Secrets ────────────────────────────────────────────────────────────────

const SECRET_NAMES = ["JWT_SECRET", "GSC_TOKEN_ENCRYPTION_KEY", "GA4_TOKEN_ENCRYPTION_KEY"] as const;

interface SecretState {
  value?: string;
  message?: string;
  consequences?: string[];
  destructive?: boolean;
  needsConfirmation?: boolean;
  error?: string;
}

/**
 * Secret generation, and the refusal in front of it.
 *
 * The refusal is the reason this panel exists in this shape. Rotating either
 * token-encryption key makes every stored Google refresh token permanently
 * undecryptable — this codebase has no key versioning — so a one-click
 * "generate" on an already-set key would be unrecoverable data loss behind a
 * button that looks like a convenience. The API refuses by default with 409
 * and returns the consequences; this panel shows them and requires a second,
 * deliberate click naming that specific variable.
 */
export function SecretsPanel({ data }: { data: WizardData }) {
  const [state, setState] = useState<Record<string, SecretState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const classificationOf = (name: string) =>
    data.report.environment.find((e) => e.name === name)?.classification;

  async function generate(name: string, confirm: boolean) {
    setBusy(name);
    const res = await installerPost<{
      value?: string;
      message?: string;
      error?: string;
      consequences?: string[];
      destructive?: boolean;
      code?: string;
    }>("/api/install/generate-secret", {
      name,
      ...(confirm ? { confirmRotation: name } : {}),
    });
    setBusy(null);

    if (res.status === 409) {
      setState((s) => ({
        ...s,
        [name]: {
          needsConfirmation: true,
          message: res.data.error,
          consequences: res.data.consequences,
          destructive: res.data.destructive,
        },
      }));
      return;
    }
    if (!res.ok) {
      setState((s) => ({ ...s, [name]: { error: errorMessage(res.data) } }));
      return;
    }
    setState((s) => ({
      ...s,
      [name]: {
        value: res.data.value,
        message: res.data.message,
        consequences: res.data.consequences,
        destructive: res.data.destructive,
      },
    }));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-secondary-foreground">
        These three values are generated from <code className="font-mono text-xs">crypto.randomBytes</code>{" "}
        on the server and shown to you once. Nothing here stores them anywhere they can be read
        back — copy each one into your environment before leaving this screen.
      </p>

      {SECRET_NAMES.map((name) => {
        const s = state[name] ?? {};
        const classification = classificationOf(name);
        const alreadySet = classification === "configured" || classification === "verified";

        return (
          <div key={name} className="rounded-md border border-default bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="font-mono text-sm font-semibold text-foreground">{name}</code>
              <Button
                type="button"
                variant={alreadySet ? "secondary" : "primary"}
                loading={busy === name}
                onClick={() => generate(name, false)}
              >
                {alreadySet ? "Replace…" : "Generate"}
              </Button>
            </div>

            {alreadySet && !s.needsConfirmation && !s.value && (
              <p className="mt-2 text-xs text-secondary-foreground">
                Already set. Leave it alone unless you have a specific reason to change it.
              </p>
            )}

            {s.error && (
              <div className="mt-3">
                <Alert variant="error">{s.error}</Alert>
              </div>
            )}

            {s.needsConfirmation && (
              <div className="mt-3 space-y-3">
                <Alert variant={s.destructive ? "error" : "warning"}>
                  <p className="font-semibold">{s.message}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {(s.consequences ?? []).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </Alert>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    loading={busy === name}
                    onClick={() => generate(name, true)}
                  >
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    Yes — replace {name}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setState((st) => ({ ...st, [name]: {} }))}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {s.value && (
              <>
                <CopyableValue label={name} value={s.value} />
                {s.destructive && (
                  <div className="mt-3">
                    <Alert variant="warning">
                      <ul className="list-disc space-y-1 pl-4">
                        {(s.consequences ?? []).map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </Alert>
                  </div>
                )}
                <p className="mt-2 text-xs text-secondary-foreground">
                  This is shown once. It is not active until it is in the environment and the
                  application has been restarted.
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Environment writing ────────────────────────────────────────────────────

interface EnvOutcome {
  persisted?: boolean;
  mode?: string;
  message?: string;
  notes?: string[];
  snippet?: string;
  dockerRunFlags?: string;
  updated?: string[];
  added?: string[];
  error?: string;
  howToFix?: string[];
}

/**
 * Save one or more environment values.
 *
 * In a container this writes NOTHING and shows the compose block instead —
 * a `.env` written inside a container is destroyed by the next redeploy, so
 * writing it would produce configuration that appears to work and then
 * silently vanishes. The panel renders whichever answer the server gave; it
 * does not decide.
 */
export function EnvWriterPanel({
  data,
  fields,
  onSaved,
}: {
  data: WizardData;
  fields: { name: string; label: string; hint?: string; type?: string; placeholder?: string }[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<EnvOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const container = !data.report.deployment.envFileIsDurable;

  async function save() {
    const updates = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v.trim().length > 0)
    );
    if (Object.keys(updates).length === 0) {
      setOutcome({ error: "Fill in at least one value before saving." });
      return;
    }
    setBusy(true);
    const res = await installerPost<EnvOutcome>("/api/install/env", { updates });
    setBusy(false);
    setOutcome(res.data);
    // Re-measure rather than believe the write. This is the rule the whole
    // installer is built on: a written value is not an active value.
    onSaved();
  }

  return (
    <div className="space-y-4">
      {container && (
        <Alert variant="info">
          This instance is running in a container, so nothing will be written to a file. Saving here
          renders the exact environment block to inject through your orchestrator — a{" "}
          <code className="font-mono text-xs">.env</code> written inside a container is erased by the
          next redeploy.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field
            key={f.name}
            id={`env-${f.name}`}
            label={f.label}
            hint={f.hint}
            type={f.type ?? "text"}
            autoComplete="off"
            spellCheck={false}
            placeholder={f.placeholder}
            value={values[f.name] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
          />
        ))}
      </div>

      <Button type="button" onClick={save} loading={busy}>
        {container ? "Show the values to inject" : "Save to .env"}
      </Button>

      {outcome?.error && (
        <Alert variant="error">
          {outcome.error}
          <Notes items={outcome.howToFix} />
        </Alert>
      )}

      {outcome && !outcome.error && (
        <Alert variant={outcome.persisted ? "warning" : "info"}>
          <p className="font-semibold">{outcome.message}</p>
          <Notes items={outcome.notes} />
        </Alert>
      )}

      {outcome?.snippet && (
        <div className="rounded-md border border-default bg-surface-subtle px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">docker-compose.yml</p>
            <CopyButton value={outcome.snippet} label="Copy compose snippet" />
          </div>
          <pre className="mt-2 overflow-x-auto font-mono text-xs text-foreground">{outcome.snippet}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Migrations ─────────────────────────────────────────────────────────────

interface MigrateResult {
  ok?: boolean;
  message?: string;
  appliedCount?: number;
  skippedCount?: number;
  steps?: { filename: string; outcome: string; message: string }[];
  failure?: { filename: string; message: string; howToFix: string[]; notAttempted: string[] };
  notes?: string[];
  error?: string;
}

export function MigrationsPanel({ onDone }: { onDone: () => void }) {
  const [result, setResult] = useState<MigrateResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = await installerPost<MigrateResult>("/api/install/migrate");
    setBusy(false);
    setResult(res.data);
    onDone();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-secondary-foreground">
        Applies every migration that has not been applied yet, in filename order, each inside its
        own transaction and verified before it is committed. If one fails, the run stops there and
        nothing after it is attempted. This installer never drops, truncates or resets anything.
      </p>

      <Button type="button" onClick={run} loading={busy}>
        Apply pending migrations
      </Button>

      {result?.error && <Alert variant="error">{result.error}</Alert>}

      {result && !result.error && (
        <Alert variant={result.ok ? "success" : "error"}>
          <p className="font-semibold">{result.message}</p>
          {result.failure && (
            <div className="mt-2">
              <p className="text-sm">{result.failure.message}</p>
              <Notes items={result.failure.howToFix} title="How to fix this" />
              {result.failure.notAttempted.length > 0 && (
                <p className="mt-2 text-xs">
                  Not attempted: {result.failure.notAttempted.join(", ")}
                </p>
              )}
            </div>
          )}
        </Alert>
      )}

      {result?.steps && result.steps.length > 0 && (
        <ul className="space-y-1.5">
          {result.steps.map((s) => (
            <li key={s.filename} className="rounded-md border border-default bg-surface px-3 py-2">
              <p className="font-mono text-xs font-semibold text-foreground">{s.filename}</p>
              <p className="mt-0.5 text-xs text-secondary-foreground">{s.message}</p>
            </li>
          ))}
        </ul>
      )}

      <Notes items={result?.notes} />
    </div>
  );
}

// ─── Google ─────────────────────────────────────────────────────────────────

interface GoogleResult {
  ok?: boolean;
  error?: string;
  validation?: {
    valid: boolean;
    issues: { field: string; severity: string; message: string; howToFix: string[] }[];
    disclaimer: string;
  };
  scopes?: { scope: string; shortName: string; plainLanguage: string }[];
  checklist?: { title: string; detail: string }[];
  testingModeWarning?: { days: number; message: string };
  env?: EnvOutcome;
}

export function GooglePanel({ data, onSaved }: { data: WizardData; onSaved: () => void }) {
  const [form, setForm] = useState({
    clientId: "",
    clientSecret: "",
    gscRedirectUri: data.redirectUris.gsc,
    ga4RedirectUri: data.redirectUris.ga4,
  });
  const [result, setResult] = useState<GoogleResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await installerPost<GoogleResult>("/api/install/google", form);
    setBusy(false);
    setResult(res.data);
    onSaved();
  }

  const issues = result?.validation?.issues ?? [];

  return (
    <div className="space-y-5">
      {/* The single most expensive mistake available on this screen. */}
      <Alert variant="warning">
        <p className="font-semibold">Publish the OAuth consent screen — do not leave it in Testing.</p>
        <p className="mt-1">
          A consent screen left in Testing mode issues refresh tokens that Google expires after{" "}
          <strong>7 days</strong>. Everything works perfectly for a week and then every connection
          breaks at once with an <code className="font-mono text-xs">invalid_grant</code> error, and
          every user has to reconnect. This was observed directly during this project&apos;s
          development.
        </p>
      </Alert>

      <div>
        <p className="text-sm font-semibold text-foreground">
          Redirect URIs — register these exactly
        </p>
        <p className="mt-1 text-xs text-secondary-foreground">
          Derived from{" "}
          <code className="font-mono text-xs">NEXT_PUBLIC_APP_URL</code>
          {data.appUrl ? "" : " (not set — these use the address you reached this page at)"}. Google
          matches redirect URIs by exact string: a trailing slash, an{" "}
          <code className="font-mono text-xs">http</code> where you registered{" "}
          <code className="font-mono text-xs">https</code>, or a missing{" "}
          <code className="font-mono text-xs">www</code> is a mismatch.
        </p>
        <CopyableValue label="Search Console redirect URI" value={data.redirectUris.gsc} />
        <CopyableValue label="Analytics redirect URI" value={data.redirectUris.ga4} />
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">What this platform will be allowed to do</p>
        <ul className="mt-2 space-y-2">
          {(result?.scopes ?? DEFAULT_SCOPES).map((s) => (
            <li key={s.scope} className="rounded-md border border-default bg-surface px-3 py-2.5">
              <p className="text-sm font-semibold text-foreground">{s.shortName}</p>
              <code className="mt-0.5 block break-all font-mono text-xs text-muted">{s.scope}</code>
              <p className="mt-1.5 text-xs leading-relaxed text-secondary-foreground">
                {s.plainLanguage}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="google-client-id"
          label="OAuth client ID"
          hint="Ends in .apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
          value={form.clientId}
          onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
        />
        <Field
          id="google-client-secret"
          label="OAuth client secret"
          hint="Begins with GOCSPX- on recent clients. Never displayed again."
          type="password"
          autoComplete="off"
          value={form.clientSecret}
          onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
        />
        <Field
          id="google-gsc-redirect"
          label="Search Console redirect URI"
          autoComplete="off"
          spellCheck={false}
          value={form.gscRedirectUri}
          onChange={(e) => setForm((f) => ({ ...f, gscRedirectUri: e.target.value }))}
        />
        <Field
          id="google-ga4-redirect"
          label="Analytics redirect URI"
          autoComplete="off"
          spellCheck={false}
          value={form.ga4RedirectUri}
          onChange={(e) => setForm((f) => ({ ...f, ga4RedirectUri: e.target.value }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} loading={busy}>
          Save Google credentials
        </Button>
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Open the Google Cloud Console
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>

      {result?.error && <Alert variant="error">{result.error}</Alert>}

      {issues.length > 0 && (
        <ul className="space-y-2">
          {issues.map((i, idx) => (
            <li key={idx}>
              <Alert variant={i.severity === "error" ? "error" : "warning"}>
                <p>{i.message}</p>
                <Notes items={i.howToFix} title="How to fix this" />
              </Alert>
            </li>
          ))}
        </ul>
      )}

      {result?.env && !result.env.error && (
        <Alert variant="warning">
          <p className="font-semibold">{result.env.message}</p>
          <Notes items={result.env.notes} />
        </Alert>
      )}

      {result?.validation && (
        <p className="text-xs leading-relaxed text-secondary-foreground">
          {result.validation.disclaimer}
        </p>
      )}

      <details className="rounded-md border border-default bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Setup checklist (guidance — the installer cannot read your Google console)
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-secondary-foreground">
          {(result?.checklist ?? DEFAULT_CHECKLIST).map((c) => (
            <li key={c.title}>
              <span className="font-semibold text-foreground">{c.title}.</span> {c.detail}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

/**
 * Rendered before the first save, so the scopes and the checklist are visible
 * without having to submit anything. Kept byte-identical in meaning to the
 * server's own copy in `src/lib/install/actions/google.ts`, which is what the
 * response replaces this with as soon as there is one.
 */
const DEFAULT_SCOPES = [
  {
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    shortName: "Search Console (read-only)",
    plainLanguage:
      "Lets the platform READ your Search Console data — the search queries, clicks, impressions, average position and indexing status for sites you already own. It cannot change anything, cannot submit or remove URLs, and cannot add or remove site owners.",
  },
  {
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    shortName: "Analytics (read-only)",
    plainLanguage:
      "Lets the platform READ your Google Analytics 4 reporting data — sessions, users, engagement and conversions for the properties you choose. It cannot modify your Analytics configuration, cannot create or delete properties, and cannot change any setting.",
  },
];

const DEFAULT_CHECKLIST = [
  { title: "Create a Google Cloud project", detail: "An existing project is fine." },
  {
    title: "Enable both APIs",
    detail:
      "The Google Search Console API and the Google Analytics Data API. A missing enablement fails at the first data request, not at connection time.",
  },
  {
    title: "Configure the OAuth consent screen",
    detail: "Add the two read-only scopes above, then PUBLISH it — see the warning at the top.",
  },
  {
    title: "Create an OAuth 2.0 Client ID of type 'Web application'",
    detail: "Other client types do not accept these redirect URIs.",
  },
  { title: "Register both redirect URIs exactly", detail: "Copy them from the fields above." },
];

// ─── Email ──────────────────────────────────────────────────────────────────

interface SmtpResult {
  ok?: boolean;
  cause?: string;
  message?: string;
  howToFix?: string[];
  detail?: string;
  optionalNote?: string;
  usedConfiguration?: { host: string; port: number; secure: boolean; authenticationConfigured: boolean; from: string };
  error?: string;
}

export function EmailPanel({ data, onSaved }: { data: WizardData; onSaved: () => void }) {
  const [recipient, setRecipient] = useState("");
  const [result, setResult] = useState<SmtpResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    const res = await installerPost<SmtpResult>("/api/install/test-smtp", { recipient });
    setBusy(false);
    setResult(res.data);
  }

  return (
    <div className="space-y-5">
      <Alert variant="info">
        Email is optional. Without it the platform still runs — verification codes and
        password-reset links are written to the server log instead of being delivered, so an
        administrator can still complete those flows manually.
      </Alert>

      <EnvWriterPanel
        data={data}
        onSaved={onSaved}
        fields={[
          { name: "EMAIL_HOST", label: "SMTP host", placeholder: "smtp.example.com" },
          { name: "EMAIL_PORT", label: "Port", hint: "587 for STARTTLS, 465 for implicit TLS" },
          { name: "EMAIL_SECURE", label: "Use implicit TLS", hint: "true for port 465, false for 587" },
          { name: "EMAIL_USER", label: "Username", hint: "Leave blank if the server needs no authentication" },
          { name: "EMAIL_PASS", label: "Password", type: "password", hint: "Never displayed again by this installer" },
          { name: "EMAIL_FROM", label: "From address", placeholder: "AI SEO Platform <noreply@example.com>" },
        ]}
      />

      <div className="border-t border-default pt-5">
        <p className="text-sm font-semibold text-foreground">Send a real test message</p>
        <p className="mt-1 text-xs text-secondary-foreground">
          This actually sends, through the same transport the application uses. It tests the values
          the running server currently holds — so if you have just saved new ones, restart first.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field
              id="smtp-recipient"
              label="Send to"
              type="email"
              autoComplete="off"
              placeholder="you@example.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>
          <Button type="button" variant="secondary" onClick={test} loading={busy}>
            Send test email
          </Button>
        </div>

        {result?.error && <div className="mt-3"><Alert variant="error">{result.error}</Alert></div>}

        {result && !result.error && (
          <div className="mt-3">
            <Alert variant={result.ok ? "success" : "warning"}>
              <p className="font-semibold">{result.message}</p>
              {result.detail && <p className="mt-1 text-xs">{result.detail}</p>}
              <Notes items={result.howToFix} title="How to fix this" />
              {result.usedConfiguration && (
                <p className="mt-2 text-xs">
                  Tested {result.usedConfiguration.host || "(no host set)"}:
                  {result.usedConfiguration.port}, TLS{" "}
                  {result.usedConfiguration.secure ? "implicit" : "STARTTLS"}, authentication{" "}
                  {result.usedConfiguration.authenticationConfigured ? "configured" : "not configured"}.
                  Credentials are never shown.
                </p>
              )}
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI ─────────────────────────────────────────────────────────────────────

interface OllamaResult {
  ok?: boolean;
  cause?: string;
  message?: string;
  howToFix?: string[];
  details?: {
    baseUrl: string;
    model: string | null;
    reachable: boolean | null;
    modelAvailable: boolean | null;
    availableModels?: string[];
    completionOk: boolean | null;
    sample?: string;
    durationMs?: number;
  };
  error?: string;
}

export function AiPanel({ data, onSaved }: { data: WizardData; onSaved: () => void }) {
  const [result, setResult] = useState<OllamaResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function test() {
    setBusy(true);
    const res = await installerPost<OllamaResult>("/api/install/test-ollama");
    setBusy(false);
    setResult(res.data);
  }

  return (
    <div className="space-y-5">
      <Alert variant="info">
        AI is entirely optional and never blocks installation. Without a model, the AI-assisted
        features report themselves as unavailable; the crawler, every rule engine, Search Console,
        Analytics, PageSpeed and all reporting work exactly the same.
      </Alert>

      <EnvWriterPanel
        data={data}
        onSaved={onSaved}
        fields={[
          { name: "OLLAMA_BASE_URL", label: "Ollama address", placeholder: "http://localhost:11434" },
          { name: "OLLAMA_MODEL", label: "Model", hint: "The exact name you pulled, e.g. llama3.2" },
        ]}
      />

      <div className="border-t border-default pt-5">
        <p className="text-sm font-semibold text-foreground">Test the model</p>
        <p className="mt-1 text-xs text-secondary-foreground">
          Checks that the host answers, that the configured model is actually pulled, and then asks
          it to generate a one-word reply — the only way to prove the model can really load and run
          on this hardware.
        </p>
        <Button type="button" variant="secondary" onClick={test} loading={busy} className="mt-3">
          Run the AI test
        </Button>

        {result?.error && <div className="mt-3"><Alert variant="error">{result.error}</Alert></div>}

        {result && !result.error && (
          <div className="mt-3">
            <Alert variant={result.ok ? "success" : "warning"}>
              <p className="font-semibold">{result.message}</p>
              <Notes items={result.howToFix} title="How to fix this" />
              {result.details?.sample && (
                <p className="mt-2 text-xs">
                  Model replied: <code className="font-mono">{result.details.sample}</code>
                </p>
              )}
              {result.details?.availableModels && result.details.availableModels.length > 0 && (
                <p className="mt-2 text-xs">
                  Models on that host: {result.details.availableModels.join(", ")}
                </p>
              )}
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Administrator ──────────────────────────────────────────────────────────

interface AdminResult {
  ok?: boolean;
  userId?: string;
  email?: string;
  name?: string;
  message?: string;
  notes?: string[];
  error?: string;
  howToFix?: string[];
  code?: string;
}

export function AdminPanel({
  data,
  onCreated,
}: {
  data: WizardData;
  onCreated: (account: { userId: string; email: string; name: string }) => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [result, setResult] = useState<AdminResult | null>(null);
  const [busy, setBusy] = useState(false);

  const adminCheck = data.report.checks.find((c) => c.id === "security.admin-exists");
  const alreadyExists = adminCheck?.status === "pass";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await installerPost<AdminResult>("/api/install/admin", form);
    setBusy(false);
    setResult(res.data);
    if (res.ok && res.data.userId && res.data.email && res.data.name) {
      // Clear the password from component state the moment it is no longer
      // needed. Nothing on the server kept it either.
      setForm({ name: "", email: "", password: "", confirmPassword: "" });
      onCreated({ userId: res.data.userId, email: res.data.email, name: res.data.name });
    }
  }

  if (alreadyExists) {
    return (
      <Alert variant="success">
        <p className="font-semibold">{adminCheck?.summary}</p>
        <p className="mt-1">
          The installer creates the first administrator only. It will never create a second one and
          never modifies an existing one — that refusal is what stops this endpoint from being an
          authentication bypass on a platform that is already running.
        </p>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-secondary-foreground">
        This account is created with the SUPER_ADMIN role and is marked email-verified so it can
        sign in immediately — the verification code would otherwise be delivered by SMTP, which is
        optional and may not be configured yet.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="admin-name"
          label="Name"
          autoComplete="off"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Field
          id="admin-email"
          label="Email address"
          type="email"
          autoComplete="off"
          required
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <Field
          id="admin-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number."
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />
        <Field
          id="admin-confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
        />
      </div>

      <Alert variant="warning">
        Write this password down now. Nothing stores it in a readable form, and this installer will
        never show it again — not on the completion screen, not anywhere.
      </Alert>

      <Button type="submit" loading={busy}>
        Create the administrator account
      </Button>

      {result?.error && (
        <Alert variant="error">
          <p className="font-semibold">{result.error}</p>
          <Notes items={result.howToFix} title="How to fix this" />
        </Alert>
      )}

      {result?.ok && (
        <Alert variant="success">
          <p className="font-semibold">{result.message}</p>
          <Notes items={result.notes} />
        </Alert>
      )}
    </form>
  );
}

// ─── Completion ─────────────────────────────────────────────────────────────

interface CompleteResult {
  ok?: boolean;
  completed?: boolean;
  message?: string;
  notes?: string[];
  consequences?: string[];
  error?: string;
  howToFix?: string[];
  blockers?: CheckResult[];
}

export function CompletePanel({
  data,
  adminAccount,
  onCompleted,
}: {
  data: WizardData;
  adminAccount: { userId: string; email: string; name: string } | null;
  onCompleted: (payload: CompleteResult) => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    const res = await installerPost<CompleteResult>("/api/install/complete", {
      confirm: "complete-installation",
      ...(adminAccount ? { adminUserId: adminAccount.userId } : {}),
    });
    setBusy(false);
    setResult(res.data);
    if (res.ok && res.data.completed) onCompleted(res.data);
  }

  return (
    <div className="space-y-5">
      <Alert variant="warning">
        <p className="font-semibold">This cannot be undone.</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {data.gate.consequences.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </Alert>

      {!data.gate.allowed && (
        <Alert variant="error">
          <p className="font-semibold">{data.gate.reason}</p>
          <p className="mt-1">
            Each blocker is listed in Final checks with what is wrong, why it matters and how to fix
            it.
          </p>
        </Alert>
      )}

      <label className="flex items-start gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-strong text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <span>
          I understand that completing the installation permanently closes this installer for this
          database, and that reopening it would require editing the database by hand.
        </span>
      </label>

      <Button
        type="button"
        variant="danger"
        disabled={!acknowledged || !data.gate.allowed}
        loading={busy}
        onClick={complete}
      >
        Complete the installation
      </Button>

      {result?.error && (
        <Alert variant="error">
          <p className="font-semibold">{result.error}</p>
          <Notes items={result.howToFix} title="How to fix this" />
        </Alert>
      )}
    </div>
  );
}
