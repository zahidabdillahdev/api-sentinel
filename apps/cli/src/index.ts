#!/usr/bin/env node
import { parseArgs, usage } from "./args.js";
import { buildReport, executeAndWait } from "./client.js";

export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.command === "help") {
      process.stdout.write(usage);
      return 0;
    }
    const run = await executeAndWait(options);
    const report = buildReport(run);
    if (options.output === "json")
      process.stdout.write(`${JSON.stringify(report)}\n`);
    else {
      process.stdout.write(
        `${run.status} ${report.summary.passed}/${report.summary.total} passed (${run.id})\n`,
      );
      for (const result of report.results)
        process.stdout.write(
          `${result.passed ? "PASS" : "FAIL"} ${result.method} ${result.name} ${result.statusCode ?? "no-response"} ${result.durationMs}ms${result.error ? ` — ${result.error}` : ""}\n`,
        );
    }
    return run.status === "PASSED" ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `api-sentinel: ${error instanceof Error ? error.message : "Unexpected error"}\n`,
    );
    return 2;
  }
}

process.exitCode = await main();
