export type RunStatusCount = {
  status: "QUEUED" | "RUNNING" | "PASSED" | "FAILED";
  _count: { _all: number };
};

export function summarizeRuns(groups: RunStatusCount[]) {
  const counts = Object.fromEntries(
    groups.map((group) => [group.status, group._count._all]),
  ) as Partial<Record<RunStatusCount["status"], number>>;
  const passed = counts.PASSED ?? 0;
  const failed = counts.FAILED ?? 0;
  const terminal = passed + failed;
  return {
    total: groups.reduce((total, group) => total + group._count._all, 0),
    queued: counts.QUEUED ?? 0,
    running: counts.RUNNING ?? 0,
    passed,
    failed,
    passRate: terminal === 0 ? null : Math.round((passed / terminal) * 10_000) / 100,
  };
}
