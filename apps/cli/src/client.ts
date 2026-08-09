import type { RunOptions } from "./args.js";

type RunResult = {
  id: string;
  statusCode: number | null;
  durationMs: number;
  error: string | null;
  passed: boolean;
  testRequest: { name: string; method: string; url: string };
};

export type ExecutionRun = {
  id: string;
  status: "QUEUED" | "RUNNING" | "PASSED" | "FAILED";
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
  results: RunResult[];
};

async function apiRequest<T>(
  options: RunOptions,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`${options.apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${options.token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? `API returned HTTP ${response.status}`);
  return payload as T;
}

const wait = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

export async function executeAndWait(options: RunOptions) {
  const run = await apiRequest<ExecutionRun>(
    options,
    `/collections/${options.collectionId}/runs`,
    { method: "POST", body: "{}" },
  );
  const deadline = Date.now() + options.timeoutSeconds * 1_000;
  let current = run;
  while (["QUEUED", "RUNNING"].includes(current.status)) {
    if (Date.now() >= deadline)
      throw new Error(`Run ${run.id} did not finish within ${options.timeoutSeconds} seconds`);
    await wait(1_000);
    current = await apiRequest<ExecutionRun>(options, `/runs/${run.id}`);
  }
  return current;
}

export function buildReport(run: ExecutionRun) {
  const passed = run.results.filter((result) => result.passed).length;
  return {
    schemaVersion: "1.0",
    command: "run",
    run: {
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      startedAt: run.startedAt ?? null,
      finishedAt: run.finishedAt ?? null,
      error: run.error ?? null,
    },
    summary: {
      total: run.results.length,
      passed,
      failed: run.results.length - passed,
    },
    results: run.results.map((result) => ({
      name: result.testRequest.name,
      method: result.testRequest.method,
      url: result.testRequest.url,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      passed: result.passed,
      error: result.error,
    })),
  };
}
