import { describe, expect, it } from 'vitest';
import { resolveVariables } from '../src/lib/variables.js';

describe('environment variable resolver', () => {
  it('replaces variables in URL, headers, and body text', () => {
    const variables = { baseUrl: 'https://staging.example.com', version: 'v1' };
    expect(resolveVariables('{{baseUrl}}/{{version}}/health', variables)).toBe('https://staging.example.com/v1/health');
  });

  it('rejects missing variables with an actionable error', () => {
    expect(() => resolveVariables('{{token}}', {})).toThrow('Environment variable "token" is not configured');
  });
});
