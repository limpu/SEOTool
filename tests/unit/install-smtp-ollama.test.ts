import { afterEach, describe, expect, it, vi } from "vitest";
import { classifySmtpFailure, smtpTestSchema } from "@/lib/install/actions/smtp";
import { listOllamaModels, modelIsAvailable } from "@/lib/install/actions/ollama";

/**
 * Web Installer — Stage 2. The two optional integration tests.
 *
 * SMTP: the point of these assertions is that a non-technical operator never
 * sees `ESOCKET ... wrong version number`. Each transport failure maps to a
 * plain cause and a concrete fix, and no branch may carry a credential.
 *
 * Ollama: every outcome is non-blocking, and the tag-matching has to tolerate
 * Ollama's own `:latest` convention — a naive exact match would report a
 * correctly configured host as broken.
 */

describe("install/smtp — failures become plain causes, never raw codes", () => {
  const cases: [string, string, string][] = [
    ["ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:587", "connection_refused"],
    ["ENOTFOUND", "getaddrinfo ENOTFOUND smtp.typo.example", "host_unreachable"],
    ["ETIMEDOUT", "Connection timeout", "timeout"],
    ["EAUTH", "535 5.7.8 Username and Password not accepted", "auth_failed"],
    ["ESOCKET", "wrong version number", "tls_mismatch"],
    ["EENVELOPE", "550 5.7.1 Relay access denied", "rejected_recipient"],
    ["EWHATEVER", "something nobody anticipated", "unknown"],
  ];

  it.each(cases)("maps %s to a plain cause", (code, raw, expected) => {
    const r = classifySmtpFailure(code, raw);
    expect(r.cause).toBe(expected);
    expect(r.howToFix.length).toBeGreaterThan(0);
    // A message a non-technical operator can act on: no bare error code.
    expect(r.message).not.toMatch(/^E[A-Z]+/);
    expect(r.message.length).toBeGreaterThan(30);
  });

  it("names the exact TLS/port pairing rather than saying 'check your settings'", () => {
    const fix = classifySmtpFailure("ESOCKET", "wrong version number").howToFix.join(" ");
    expect(fix).toContain("465");
    expect(fix).toContain("587");
    expect(fix).toContain("EMAIL_SECURE");
  });

  it("tells the operator app passwords are needed for Gmail / Microsoft 365 on an auth failure", () => {
    const fix = classifySmtpFailure("EAUTH", "535 auth failed").howToFix.join(" ");
    expect(fix).toMatch(/app password/i);
    // And it never suggests reading the password back — nothing stores it.
    expect(fix).toMatch(/retype it/i);
  });

  it("NEVER puts a credential into a classification, even when the raw text contains one", () => {
    const raw = "535 auth failed for user ops@example.com with password hunter2seekrit";
    const r = classifySmtpFailure("EAUTH", raw);
    expect(JSON.stringify(r)).not.toContain("hunter2seekrit");
  });

  it("classification is derived from either the code or the message text", () => {
    // A driver that supplies no code at all still gets a real diagnosis.
    expect(classifySmtpFailure(undefined, "connect ECONNREFUSED 1.2.3.4:25").cause).toBe(
      "connection_refused"
    );
  });

  it("validates the recipient with the application's own email rules", () => {
    expect(smtpTestSchema.safeParse({ recipient: "ops@example.com" }).success).toBe(true);
    expect(smtpTestSchema.safeParse({ recipient: "not-an-email" }).success).toBe(false);
    const normalised = smtpTestSchema.safeParse({ recipient: "  OPS@Example.COM " });
    if (normalised.success) expect(normalised.data.recipient).toBe("ops@example.com");
  });
});

describe("install/ollama — model matching and reachability", () => {
  afterEach(() => vi.restoreAllMocks());

  it("matches a bare model name against Ollama's :latest convention", () => {
    // `OLLAMA_MODEL=llama3.2` is a CORRECT configuration — Ollama resolves it
    // to :latest itself — so a naive exact match would be a false failure.
    expect(modelIsAvailable("llama3.2", ["llama3.2:latest"])).toBe(true);
    expect(modelIsAvailable("llama3.2:latest", ["llama3.2:latest"])).toBe(true);
    expect(modelIsAvailable("llama3.2:1b", ["llama3.2:1b"])).toBe(true);
  });

  it("does not match a different tag or a different model", () => {
    expect(modelIsAvailable("llama3.2:1b", ["llama3.2:latest"])).toBe(false);
    expect(modelIsAvailable("mistral", ["llama3.2:latest"])).toBe(false);
    expect(modelIsAvailable("", ["llama3.2:latest"])).toBe(false);
  });

  it("reports an unreachable host without throwing, and sanitizes the reason", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:11434"));
    const r = await listOllamaModels("http://localhost:11434", 100, fetchImpl as unknown as typeof fetch);
    expect(r.reachable).toBe(false);
    expect(r.models).toEqual([]);
    expect(r.error).toContain("ECONNREFUSED");
  });

  it("reads the model list from a reachable host", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "llama3.2:latest" }, { name: "mistral:7b" }] }),
    });
    const r = await listOllamaModels("http://localhost:11434/", 100, fetchImpl as unknown as typeof fetch);
    expect(r.reachable).toBe(true);
    expect(r.models).toEqual(["llama3.2:latest", "mistral:7b"]);
    // The trailing slash was normalised rather than producing a double slash.
    expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:11434/api/tags");
  });

  it("treats a non-200 as reachable-but-wrong rather than unreachable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const r = await listOllamaModels("http://localhost:11434", 100, fetchImpl as unknown as typeof fetch);
    expect(r.reachable).toBe(true);
    expect(r.error).toContain("403");
  });
});

describe("install/ollama — every outcome is non-blocking", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("an unconfigured model is a supported state, not a failure that blocks anything", async () => {
    vi.stubEnv("OLLAMA_MODEL", "");
    const { testOllama } = await import("@/lib/install/actions/ollama");
    const r = await testOllama();
    expect(r.cause).toBe("not_configured");
    expect(r.blocking).toBe(false);
    expect(r.message).toMatch(/supported state, not a failure/i);
    expect(r.howToFix.join(" ")).toMatch(/without AI/i);
  });
});
