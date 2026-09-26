"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * The install token gate.
 *
 * This is the whole security model in one screen, so the copy has to explain
 * it rather than just demand a value. An `/install` route that can create the
 * first SUPER_ADMIN is, until it is locked, an unauthenticated remote
 * admin-creation endpoint; "no admin exists yet" is the attacker's window,
 * not the protection. The token is the protection, because possessing it
 * proves filesystem or container-log access — that is, proves the requester
 * is the person who deployed this instance.
 *
 * The submitted value goes to `POST /api/install/verify-token`, which sets an
 * httpOnly cookie. It is deliberately never kept in component state after
 * submission and never written to `localStorage`: the token stays out of page
 * JavaScript entirely, so an XSS anywhere in this page cannot read it.
 *
 * One failure message covers a wrong token, an empty one and a missing token
 * file. Distinguishing them would tell a prober which of those three
 * situations they are in, and none of it is their business.
 */
export function TokenGate({ tokenFilePresent }: { tokenFilePresent: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setRetryAfter(null);
    try {
      const res = await fetch("/api/install/verify-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: value.trim() }),
      });
      if (res.ok) {
        // Clear it from memory before the reload, then let the server render
        // the wizard using the httpOnly cookie it just set.
        setValue("");
        window.location.reload();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "That token was not accepted.");
      if (typeof body.retryAfterSeconds === "number") setRetryAfter(body.retryAfterSeconds);
    } catch {
      setError("The installer could not be reached. Check that the application is still running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-subtle">
            <KeyRound className="h-5 w-5 text-muted" aria-hidden="true" />
          </span>
          <CardTitle>Enter the install token</CardTitle>
          <CardDescription>
            This installer can create the first administrator account, so it is protected before it
            is used — not after.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="install-token" className="mb-1.5 block text-sm font-medium text-foreground">
                Install token
              </label>
              <Input
                id="install-token"
                name="install-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="43-character token"
                error={error ?? undefined}
              />
              {error && (
                <p id="install-token-error" className="mt-2">
                  <Alert variant="error">
                    {error}
                    {retryAfter !== null && (
                      <>
                        {" "}
                        Try again in about {Math.ceil(retryAfter / 60)} minute
                        {Math.ceil(retryAfter / 60) === 1 ? "" : "s"}.
                      </>
                    )}
                  </Alert>
                </p>
              )}
            </div>

            <Button type="submit" loading={busy} className="w-full">
              Continue
            </Button>
          </form>

          <div className="mt-6 space-y-3 border-t border-default pt-5 text-sm text-secondary-foreground">
            <p className="font-semibold text-foreground">Where to find it</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                It was printed in the application&apos;s startup log, once, in a bordered banner. In
                a container: <code className="font-mono text-xs">docker logs &lt;container&gt;</code>.
              </li>
              <li>
                {tokenFilePresent ? (
                  <>
                    It is also stored in <code className="font-mono text-xs">.install-token</code> in
                    the project root (mode 0600 on Linux).
                  </>
                ) : (
                  <>
                    There is currently no <code className="font-mono text-xs">.install-token</code>{" "}
                    file in the project root, so the startup log is the only place to get it.
                    Restarting the application will generate a new token and print it again.
                  </>
                )}
              </li>
            </ul>
            <p>
              Anyone holding this token can create the first administrator. Treat it as a password:
              do not paste it into a chat, a ticket, or a screenshot.
            </p>
            <p className="text-xs">
              Attempts are rate-limited to five wrong guesses per fifteen minutes. A correct token
              does not count against that limit.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
