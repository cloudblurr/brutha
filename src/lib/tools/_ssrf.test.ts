import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DNS resolver so we can simulate a hostname resolving to a private or
// public address. ESM builtins can't be spied with vi.spyOn, so we mock the
// module and control the return value per test via a mutable holder.
const dnsResult: { addrs: { address: string; family: number }[] } = { addrs: [] };
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => dnsResult.addrs),
}));

import { isPrivateIp, assertPublicUrl, BlockedUrlError } from "@/lib/tools/_ssrf";

beforeEach(() => {
  dnsResult.addrs = [];
});

describe("isPrivateIp", () => {
  it("flags IPv4 private/loopback/link-local ranges", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "192.168.1.1", "172.16.5.4", "169.254.169.254", "0.0.0.0"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });
  it("flags IPv6 loopback / link-local / ULA", () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "fd12:3456::1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("ftp://example.com")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("rejects literal private IPs (incl. cloud metadata)", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(
      BlockedUrlError
    );
    await expect(assertPublicUrl("http://127.0.0.1:8080/admin")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("rejects internal hostnames without DNS", async () => {
    await expect(assertPublicUrl("http://localhost/x")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(assertPublicUrl("http://db.internal/x")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("rejects a public hostname that resolves to a private IP", async () => {
    dnsResult.addrs = [{ address: "10.1.2.3", family: 4 }];
    await expect(assertPublicUrl("http://evil.example.com")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("allows a public hostname that resolves to a public IP", async () => {
    dnsResult.addrs = [{ address: "93.184.216.34", family: 4 }];
    await expect(assertPublicUrl("https://example.com")).resolves.toBeUndefined();
  });
});
