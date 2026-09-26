import { describe, it, expect } from "vitest";
import { isBlockedIp, isAllowedProtocol } from "@/lib/crawler/ssrf";

describe("isBlockedIp — IPv4", () => {
  it("blocks loopback, private, link-local, and metadata ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.5")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true); // cloud metadata
    expect(isBlockedIp("0.0.0.0")).toBe(true);
    expect(isBlockedIp("100.64.0.1")).toBe(true); // CGNAT
    expect(isBlockedIp("224.0.0.1")).toBe(true); // multicast
    expect(isBlockedIp("255.255.255.255")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("1.1.1.1")).toBe(false);
    expect(isBlockedIp("93.184.216.34")).toBe(false); // example.com
  });

  it("does not false-positive on addresses that merely resemble private ranges", () => {
    expect(isBlockedIp("11.0.0.1")).toBe(false); // not 10.x
    expect(isBlockedIp("172.32.0.1")).toBe(false); // just past 172.16-31
    expect(isBlockedIp("172.15.255.255")).toBe(false); // just before 172.16
  });
});

describe("isBlockedIp — IPv6", () => {
  it("blocks loopback, unspecified, link-local, and unique-local", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("::")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
    expect(isBlockedIp("fd12:3456::1")).toBe(true);
  });

  it("blocks IPv4-mapped private addresses", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:10.0.0.1")).toBe(true);
  });

  it("allows a public IPv6 address", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false); // Cloudflare DNS
  });
});

describe("isAllowedProtocol", () => {
  it("allows http and https only", () => {
    expect(isAllowedProtocol("http:")).toBe(true);
    expect(isAllowedProtocol("https:")).toBe(true);
    expect(isAllowedProtocol("file:")).toBe(false);
    expect(isAllowedProtocol("ftp:")).toBe(false);
    expect(isAllowedProtocol("gopher:")).toBe(false);
  });
});
