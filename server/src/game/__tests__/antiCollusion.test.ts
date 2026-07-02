import { describe, it, expect } from 'vitest';
import { hasNetworkCollision } from '../antiCollusion.js';

describe('hasNetworkCollision (доделка §10.6)', () => {
  it('совпадение по ip → true', () => {
    const seated = [{ ip: '1.2.3.4', deviceId: 'aaa' }];
    expect(hasNetworkCollision(seated, { ip: '1.2.3.4', deviceId: 'bbb' })).toBe(true);
  });

  it('совпадение по deviceId → true', () => {
    const seated = [{ ip: '1.2.3.4', deviceId: 'aaa' }];
    expect(hasNetworkCollision(seated, { ip: '9.9.9.9', deviceId: 'aaa' })).toBe(true);
  });

  it('разные ip и deviceId → false', () => {
    const seated = [{ ip: '1.2.3.4', deviceId: 'aaa' }];
    expect(hasNetworkCollision(seated, { ip: '9.9.9.9', deviceId: 'bbb' })).toBe(false);
  });

  it('пустые строки не считаются совпадением', () => {
    const seated = [{ ip: '', deviceId: '' }];
    expect(hasNetworkCollision(seated, { ip: '', deviceId: '' })).toBe(false);
  });

  it('пустой список сидящих → false', () => {
    expect(hasNetworkCollision([], { ip: '1.2.3.4', deviceId: 'aaa' })).toBe(false);
  });
});
