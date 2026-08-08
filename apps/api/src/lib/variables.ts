export function resolveVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_, key: string) => {
    if (!(key in variables)) throw new Error(`Environment variable "${key}" is not configured`);
    return variables[key];
  });
}
