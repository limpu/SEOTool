import { isIPv4, isIPv6 } from "net";

/**
 * Returns true if the given IP address is private, loopback, link-local,
 * reserved, or otherwise not a legitimate public crawl target. Covers both
 * IPv4 and IPv6, including IPv4-mapped IPv6 addresses (::ffff:127.0.0.1)
 * and cloud metadata endpoints (169.254.169.254 falls under link-local).
 */
export function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedIpv4(ip);
  if (isIPv6(ip)) return isBlockedIpv6(ip);
  // Anything we can't classify is treated as blocked — fail closed.
  return true;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast

  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified

  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded IPv4 address.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  const firstHextet = normalized.split(":")[0];
  const firstGroupValue = parseInt(firstHextet || "0", 16) || 0;

  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true; // fc00::/7 unique local
  }
  if (firstGroupValue === 0 && normalized !== "::1") {
    return true; // ::/8 reserved (includes IPv4-compatible, documented as legacy/unsafe)
  }

  return false;
}

export function isAllowedProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}
