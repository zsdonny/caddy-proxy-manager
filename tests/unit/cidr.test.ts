import { describe, it, expect } from 'vitest';
import { isIpInCidr, isIpInAnyCidr, isValidCidr } from '../../src/lib/cidr';

describe('isValidCidr', () => {
  it('accepts valid IPv4 CIDRs', () => {
    expect(isValidCidr('10.0.0.0/8')).toBe(true);
    expect(isValidCidr('192.168.1.0/24')).toBe(true);
    expect(isValidCidr('173.245.48.0/20')).toBe(true);
  });

  it('accepts valid IPv6 CIDRs', () => {
    expect(isValidCidr('2400:cb00::/32')).toBe(true);
    expect(isValidCidr('::1/128')).toBe(true);
    expect(isValidCidr('fe80::/10')).toBe(true);
  });

  it('rejects invalid CIDRs', () => {
    expect(isValidCidr('not-a-cidr')).toBe(false);
    expect(isValidCidr('10.0.0.0')).toBe(false);
    expect(isValidCidr('10.0.0.0/33')).toBe(false);
    expect(isValidCidr('999.0.0.0/8')).toBe(false);
    expect(isValidCidr('')).toBe(false);
  });
});

describe('isIpInCidr', () => {
  it('matches IPv4 addresses within a CIDR', () => {
    expect(isIpInCidr('10.0.0.1', '10.0.0.0/8')).toBe(true);
    expect(isIpInCidr('10.255.255.255', '10.0.0.0/8')).toBe(true);
    expect(isIpInCidr('192.168.1.100', '192.168.1.0/24')).toBe(true);
    expect(isIpInCidr('173.245.48.12', '173.245.48.0/20')).toBe(true);
  });

  it('rejects IPv4 addresses outside a CIDR', () => {
    expect(isIpInCidr('11.0.0.1', '10.0.0.0/8')).toBe(false);
    expect(isIpInCidr('192.168.2.1', '192.168.1.0/24')).toBe(false);
    expect(isIpInCidr('173.246.0.1', '173.245.48.0/20')).toBe(false);
  });

  it('matches IPv6 addresses within a CIDR', () => {
    expect(isIpInCidr('2400:cb00::1', '2400:cb00::/32')).toBe(true);
    expect(isIpInCidr('::1', '::1/128')).toBe(true);
    expect(isIpInCidr('fe80::1', 'fe80::/10')).toBe(true);
  });

  it('rejects IPv6 addresses outside a CIDR', () => {
    expect(isIpInCidr('2401:cb00::1', '2400:cb00::/32')).toBe(false);
  });

  it('returns false for IPv4/IPv6 mismatch', () => {
    expect(isIpInCidr('10.0.0.1', '::1/128')).toBe(false);
    expect(isIpInCidr('::1', '10.0.0.0/8')).toBe(false);
  });

  it('returns false for invalid inputs', () => {
    expect(isIpInCidr('foo', '10.0.0.0/8')).toBe(false);
    expect(isIpInCidr('10.0.0.1', 'not-valid')).toBe(false);
  });
});

describe('isIpInAnyCidr', () => {
  const cloudflare = ['173.245.48.0/20', '103.21.244.0/22', '108.162.192.0/18'];

  it('matches if IP is in any CIDR', () => {
    expect(isIpInAnyCidr('173.245.48.12', cloudflare)).toBe(true);
    expect(isIpInAnyCidr('103.21.245.1', cloudflare)).toBe(true);
    expect(isIpInAnyCidr('108.162.200.5', cloudflare)).toBe(true);
  });

  it('returns false if IP is in none of the CIDRs', () => {
    expect(isIpInAnyCidr('1.2.3.4', cloudflare)).toBe(false);
    expect(isIpInAnyCidr('192.168.1.1', cloudflare)).toBe(false);
  });

  it('returns false for empty CIDR list', () => {
    expect(isIpInAnyCidr('10.0.0.1', [])).toBe(false);
  });
});
