export type RunOptions = {
  command: "run";
  apiUrl: string;
  token: string;
  collectionId: string;
  timeoutSeconds: number;
  output: "pretty" | "json";
};

export const usage = `API Sentinel CLI

Usage:
  api-sentinel run --collection <id> [options]

Options:
  --api-url <url>       API base URL (or API_SENTINEL_URL)
  --token <token>       bearer token (or API_SENTINEL_TOKEN)
  --collection <id>     collection ID to execute
  --timeout <seconds>   polling timeout, 10-900 (default: 120)
  --output <format>     pretty or json (default: pretty)
  --help                show this help
`;

function value(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const candidate = args[index + 1];
  if (!candidate || candidate.startsWith("--"))
    throw new Error(`${name} requires a value`);
  return candidate;
}

export function parseArgs(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): RunOptions | { command: "help" } {
  if (args.includes("--help") || args.includes("-h")) return { command: "help" };
  if (args[0] !== "run") throw new Error("Expected the run command");
  const apiUrl = value(args, "--api-url") ?? environment.API_SENTINEL_URL;
  const token = value(args, "--token") ?? environment.API_SENTINEL_TOKEN;
  const collectionId = value(args, "--collection");
  const timeoutSeconds = Number(value(args, "--timeout") ?? "120");
  const output = value(args, "--output") ?? "pretty";
  if (!apiUrl) throw new Error("API URL is required");
  if (!token) throw new Error("API token is required");
  if (!collectionId) throw new Error("Collection ID is required");
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 900)
    throw new Error("Timeout must be an integer between 10 and 900 seconds");
  if (output !== "pretty" && output !== "json")
    throw new Error("Output must be pretty or json");
  let normalizedUrl: string;
  try {
    const parsed = new URL(apiUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    normalizedUrl = parsed.toString().replace(/\/$/, "");
  } catch {
    throw new Error("API URL must be a valid HTTP or HTTPS URL");
  }
  return {
    command: "run",
    apiUrl: normalizedUrl,
    token,
    collectionId,
    timeoutSeconds,
    output,
  };
}
