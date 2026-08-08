const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization']);

export function redactHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(headers).flatMap(([name, value]) => {
    if (value === undefined) return [];
    return [[name, SENSITIVE_HEADERS.has(name.toLowerCase()) ? '[REDACTED]' : value]];
  }));
}

export function redactJson(value: unknown, keys = ['password', 'token', 'secret', 'apiKey']): unknown {
  if (Array.isArray(value)) return value.map((item) => redactJson(item, keys));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, keys.some((sensitive) => key.toLowerCase().includes(sensitive.toLowerCase())) ? '[REDACTED]' : redactJson(nested, keys)]));
}
