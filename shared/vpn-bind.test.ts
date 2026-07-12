import { describe, it, expect } from 'vitest';
import { isVpnIfaceName, selectVpnIPv4, resolveBindOverrides, planBindAction } from './vpn-bind';

// Minimal os.networkInterfaces()-shaped fixtures.
const v4 = (address: string, internal = false) => ({ family: 'IPv4' as const, address, internal });
const v6 = (address: string, internal = false) => ({ family: 'IPv6' as const, address, internal });

describe('isVpnIfaceName', () => {
  it('matches common VPN adapter names', () => {
    for (const n of ['tun0', 'tap1', 'wg0', 'utun3', 'ppp0', 'NordLynx', 'Mullvad', 'ProtonVPN Tunnel', 'MyCorp VPN']) {
      expect(isVpnIfaceName(n)).toBe(true);
    }
  });
  it('does not match regular adapters', () => {
    for (const n of ['Ethernet', 'Wi-Fi', 'lo', 'eth0', 'Беспроводная сеть']) {
      expect(isVpnIfaceName(n)).toBe(false);
    }
  });
});

describe('selectVpnIPv4', () => {
  it('returns the first non-internal IPv4 of a VPN adapter', () => {
    expect(selectVpnIPv4({
      'Ethernet': [v4('192.168.1.10')],
      'wg0': [v6('fc00::2'), v4('10.64.0.2')],
    })).toEqual({ iface: 'wg0', address: '10.64.0.2' });
  });
  it('accepts the legacy numeric family form', () => {
    expect(selectVpnIPv4({
      'tun0': [{ family: 4, address: '10.8.0.5', internal: false }],
    })).toEqual({ iface: 'tun0', address: '10.8.0.5' });
  });
  it('skips internal and IPv6-only VPN adapters', () => {
    expect(selectVpnIPv4({
      'tun0': [v4('127.0.0.1', true), v6('fd00::1')],
    })).toBeNull();
  });
  it('returns null when only regular adapters exist', () => {
    expect(selectVpnIPv4({
      'Ethernet': [v4('192.168.1.10')],
      'Wi-Fi': [v4('192.168.1.11')],
      'lo': [v4('127.0.0.1', true)],
    })).toBeNull();
  });
  it('tolerates undefined address lists', () => {
    expect(selectVpnIPv4({ 'wg0': undefined, 'Ethernet': [v4('192.168.1.10')] })).toBeNull();
  });
});

describe('resolveBindOverrides', () => {
  it('binds IPv4 to the VPN address and IPv6 to loopback', () => {
    expect(resolveBindOverrides({ address: '10.64.0.2' })).toEqual({
      'bind-address-ipv4': '10.64.0.2',
      'bind-address-ipv6': '::1',
    });
  });
  it('fails closed to loopback when no VPN is present', () => {
    expect(resolveBindOverrides(null)).toEqual({
      'bind-address-ipv4': '127.0.0.1',
      'bind-address-ipv6': '::1',
    });
  });
});

describe('planBindAction', () => {
  const bound = { enabled: true, boundIp: '10.64.0.2' };
  const fallback = { enabled: true, boundIp: null };

  it('is a no-op when the feature is off or status is unknown', () => {
    expect(planBindAction(null, '10.64.0.2', false)).toBe('none');
    expect(planBindAction({ enabled: false, boundIp: null }, '10.64.0.2', false)).toBe('none');
  });
  it('does nothing while the bound address is still current', () => {
    expect(planBindAction(bound, '10.64.0.2', false)).toBe('none');
  });
  it('rebinds when the VPN address changed', () => {
    expect(planBindAction(bound, '10.64.0.7', false)).toBe('rebind');
  });
  it('rebinds when a VPN appears after a loopback-fallback start', () => {
    expect(planBindAction(fallback, '10.64.0.2', false)).toBe('rebind');
  });
  it('reports lost exactly once when the bound address vanishes', () => {
    expect(planBindAction(bound, null, false)).toBe('lost');
    expect(planBindAction(bound, null, true)).toBe('none'); // latched — no repeat
  });
  it('never reports lost from the loopback fallback (nothing to lose)', () => {
    expect(planBindAction(fallback, null, false)).toBe('none');
  });
  it('reports restored when the same address returns after a loss', () => {
    expect(planBindAction(bound, '10.64.0.2', true)).toBe('restored');
  });
});
