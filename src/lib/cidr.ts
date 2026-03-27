/**
 * Pure CIDR matching utilities.
 * Supports IPv4 and IPv6 CIDRs.
 */

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return nums;
}

function parseIPv6Full(ip: string): number[] | null {
  // Expand :: shorthand
  let parts: string[];
  const doubleColon = ip.indexOf('::');
  if (doubleColon !== -1) {
    const left = ip.slice(0, doubleColon).split(':').filter(Boolean);
    const right = ip.slice(doubleColon + 2).split(':').filter(Boolean);
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    parts = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    parts = ip.split(':');
  }
  if (parts.length !== 8) return null;
  const nums = parts.map((p) => parseInt(p, 16));
  if (nums.some((n) => isNaN(n) || n < 0 || n > 0xffff)) return null;
  // Convert 8 x 16-bit groups to 16 bytes
  const bytes: number[] = [];
  for (const n of nums) {
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

function ipToBytes(ip: string): number[] | null {
  if (ip.includes(':')) return parseIPv6Full(ip);
  return parseIPv4(ip);
}

function cidrToPrefix(cidr: string): { bytes: number[]; prefixLen: number } | null {
  const slash = cidr.lastIndexOf('/');
  if (slash === -1) return null;
  const ip = cidr.slice(0, slash);
  const prefix = parseInt(cidr.slice(slash + 1), 10);
  if (isNaN(prefix) || prefix < 0) return null;
  const bytes = ipToBytes(ip);
  if (!bytes) return null;
  const maxBits = bytes.length * 8;
  if (prefix > maxBits) return null;
  return { bytes, prefixLen: prefix };
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const ipBytes = ipToBytes(ip);
  const prefix = cidrToPrefix(cidr);
  if (!ipBytes || !prefix) return false;
  if (ipBytes.length !== prefix.bytes.length) return false; // IPv4 vs IPv6 mismatch

  const fullBytes = Math.floor(prefix.prefixLen / 8);
  const remainBits = prefix.prefixLen % 8;

  for (let i = 0; i < fullBytes; i++) {
    if (ipBytes[i] !== prefix.bytes[i]) return false;
  }
  if (remainBits > 0) {
    const mask = 0xff << (8 - remainBits);
    if ((ipBytes[fullBytes] & mask) !== (prefix.bytes[fullBytes] & mask)) return false;
  }
  return true;
}

export function isIpInAnyCidr(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => isIpInCidr(ip, cidr));
}

export function isValidCidr(cidr: string): boolean {
  return cidrToPrefix(cidr) !== null;
}
