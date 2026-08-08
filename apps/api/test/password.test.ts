import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

describe('password hashing', () => {
  it('verifies the correct password and rejects a different password', async () => {
    const hash = await hashPassword('a-secure-password');

    expect(hash).not.toContain('a-secure-password');
    await expect(verifyPassword('a-secure-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('a-different-password', hash)).resolves.toBe(false);
  });

  it('rejects malformed hashes safely', async () => {
    await expect(verifyPassword('a-secure-password', 'invalid')).resolves.toBe(false);
  });
});
