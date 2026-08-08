import { describe, expect, it } from 'vitest';
import { assertSafeTarget } from '../src/lib/safe-url.js';

describe('safe target URLs', () => {
  it('rejects local and non-HTTPS targets before making DNS requests', async () => {
    await expect(assertSafeTarget('http://example.com')).rejects.toThrow('Only public HTTPS');
    await expect(assertSafeTarget('https://localhost/test')).rejects.toThrow('Only public HTTPS');
    await expect(assertSafeTarget('https://127.0.0.1/test')).rejects.toThrow('Private network');
  });
});
