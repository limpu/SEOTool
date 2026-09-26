import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase 32 — Security Audit regression test. `assertPublicUrl` in
// `src/lib/pagespeed/lighthouse-runner.ts` is Lighthouse's SSRF guard: it
// must reject a target that resolves only to private/loopback/metadata
// addresses, and — for a target that has BOTH a public and a blocked
// address (the DNS-rebinding attack shape) — it must return the public
// address to be pinned into Chrome via `--host-resolver-rules`, per the
// Phase 32 hardening documented in that file.

const lookupMock = vi.fn();

vi.mock("dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

import { assertPublicUrl, buildHostResolverRule, LighthouseRunError } from "@/lib/pagespeed/lighthouse-runner";

describe("Lighthouse SSRF guard (assertPublicUrl)", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("rejects a hostname that resolves only to a loopback address", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(assertPublicUrl("http://evil.test/")).rejects.toBeInstanceOf(LighthouseRunError);
  });

  it("rejects a hostname that resolves only to the cloud-metadata address", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(assertPublicUrl("http://metadata.test/")).rejects.toThrow(/private\/blocked address/);
  });

  it("rejects a hostname that resolves only to a private-range address", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertPublicUrl("http://internal.test/")).rejects.toBeInstanceOf(LighthouseRunError);
  });

  it("rejects an unsupported protocol before ever resolving DNS", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/Unsupported protocol/);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("accepts a hostname that resolves to a public address and returns it for pinning", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const { url, pinnedIp } = await assertPublicUrl("https://example.com/");
    expect(url.hostname).toBe("example.com");
    expect(pinnedIp).toBe("93.184.216.34");
  });

  it("DNS-rebinding shape: picks the safe address when the resolver returns both a public and a blocked record", async () => {
    // A malicious/compromised resolver answering with a private address
    // alongside a public one — assertPublicUrl must not treat the presence
    // of ANY public record as a blanket pass while blindly handing Chrome
    // whichever record Chrome's own later independent resolution happens
    // to pick; it must pin the specific safe address it validated.
    lookupMock.mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ]);
    const { pinnedIp } = await assertPublicUrl("https://rebind.test/");
    expect(pinnedIp).toBe("93.184.216.34");
  });

  it("rejects when every resolved address is blocked, even with multiple records", async () => {
    lookupMock.mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
      { address: "127.0.0.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    await expect(assertPublicUrl("https://all-blocked.test/")).rejects.toBeInstanceOf(LighthouseRunError);
  });

  it("rejects when DNS resolution fails outright", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicUrl("https://nonexistent.test/")).rejects.toThrow(/Could not resolve hostname/);
  });
});

describe("buildHostResolverRule (Chrome DNS-pinning flag)", () => {
  it("builds a MAP rule for an IPv4 pin", () => {
    expect(buildHostResolverRule("example.com", "93.184.216.34")).toBe(
      "--host-resolver-rules=MAP example.com 93.184.216.34"
    );
  });

  it("brackets an IPv6 pin per Chrome's host-resolver-rules syntax", () => {
    expect(buildHostResolverRule("example.com", "2606:2800:220:1:248:1893:25c8:1946")).toBe(
      "--host-resolver-rules=MAP example.com [2606:2800:220:1:248:1893:25c8:1946]"
    );
  });
});
