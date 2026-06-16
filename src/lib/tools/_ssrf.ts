import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF protection for the fetchUrl tool.
 *
 * fetchUrl lets the model read arbitrary server-side URLs, which is an SSRF
 * vector: a crafted prompt could target cloud metadata endpoints
 * (169.254.169.254), localhost services, or RFC1918 internal hosts. This guard:
 *   1. Allows only http/https schemes.
 *   2. Rejects hostnames that are, or resolve to, private/loopback/link-local/
 *      reserved IP ranges (checked AFTER DNS resolution to defeat hostnames
 *      that point at internal IPs).
 *
 * Note: this validates at request time. A fully hardened setup would also pin
 * the resolved IP and block redirects to private hosts; we reject redirects to
 * disallowed hosts by re-validating in the caller via `redirect: "manual"`.
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** True if an IP string is in a private / loopback / link-local / reserved range. */
export function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isPrivateIpv4(ip);
  if (type === 6) return isPrivateIpv6(ip);
  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed -> treat as unsafe
  }
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast/reserved 224.0.0.0+
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — extract and check the v4 part.
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/**
 * Validate a URL for outbound fetch. Throws BlockedUrlError if the scheme is
 * not http/https or the host is/resolves to a private address.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("Invalid URL.");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new BlockedUrlError(`Blocked URL scheme '${url.protocol}'. Only http/https are allowed.`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // If the host is a literal IP, check it directly.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new BlockedUrlError("Blocked request to a private or reserved IP address.");
    }
    return;
  }

  // Block obvious internal names without a DNS round-trip.
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new BlockedUrlError("Blocked request to an internal hostname.");
  }

  // Resolve the hostname and reject if ANY resolved address is private.
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new BlockedUrlError("Could not resolve host.");
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new BlockedUrlError("Blocked request to a host that resolves to a private address.");
  }
}
