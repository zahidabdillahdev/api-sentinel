import { describe, expect, it } from 'vitest';
import { redactHeaders, redactJson } from '../src/lib/redaction.js';

describe('redaction', () => {
  it('does not expose credential headers', () => {
    expect(redactHeaders({ Authorization: 'Bearer secret', Accept: 'application/json' })).toEqual({ Authorization: '[REDACTED]', Accept: 'application/json' });
  });
  it('redacts sensitive nested JSON keys', () => {
    expect(redactJson({ user: { password: 'hidden' }, id: 'visible' })).toEqual({ user: { password: '[REDACTED]' }, id: 'visible' });
  });
});
