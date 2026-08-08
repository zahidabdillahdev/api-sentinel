import { describe, expect, it } from 'vitest';
import { hashSessionToken } from '../src/plugins/auth.js';

describe('session tokens', () => {
  it('creates a stable hash without retaining the token', () => {
    const token = 'private-session-token';
    const hash = hashSessionToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hashSessionToken('another-token')).not.toBe(hash);
  });
});
