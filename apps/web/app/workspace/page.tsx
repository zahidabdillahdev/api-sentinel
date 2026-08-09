"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/v1";
type User = { email: string; name: string | null };
type Organization = {
  id: string;
  name: string;
  members: Array<{ role: string }>;
};
type Project = { id: string; name: string };
type Environment = { id: string; name: string; baseUrl: string };
type EnvironmentSecret = { id: string; name: string; createdAt: string };
const OPENAPI_EXAMPLE = `{
  "openapi": "3.0.3",
  "info": { "title": "Pet API", "version": "1.0.0" },
  "paths": {}
}`;
type Specification = {
  id: string;
  name: string;
  versions: Array<{
    id: string;
    version: number;
    title: string;
    apiVersion: string;
  }>;
};
type Reference = {
  id: string;
  title: string;
  apiVersion: string;
  operationCount: number;
  operations: Array<{
    method: string;
    path: string;
    summary?: string;
    responseCodes: string[];
  }>;
};
type Version = {
  id: string;
  version: number;
  title: string;
  apiVersion: string;
  createdAt: string;
};
type Change = {
  severity: "BREAKING" | "POTENTIALLY_BREAKING" | "NON_BREAKING";
  code: string;
  location: string;
  message: string;
};
type Diff = { summary: { breaking: number; total: number }; changes: Change[] };
type Collection = {
  id: string;
  name: string;
  requests: Array<{
    id: string;
    name: string;
    method: string;
    url: string;
    assertions: Array<{ expectedStatus: number }>;
  }>;
};
type Schedule = {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
};
type WebhookDelivery = {
  id: string;
  executionRunId: string;
  attempt: number;
  status: "DELIVERED" | "FAILED";
  responseStatus: number | null;
  durationMs: number;
  error: string | null;
  createdAt: string;
};
type NotificationRule = {
  id: string;
  name: string;
  endpointOrigin: string;
  enabled: boolean;
  deliveries: WebhookDelivery[];
};
type ProjectOverview = {
  counts: { collections: number; requests: number; activeSchedules: number };
  last24Hours: {
    total: number;
    queued: number;
    running: number;
    passed: number;
    failed: number;
    passRate: number | null;
    averageRequestDurationMs: number | null;
  };
  recentRuns: Array<{
    id: string;
    status: string;
    createdAt: string;
    collection: { id: string; name: string };
    _count: { results: number };
  }>;
  generatedAt: string;
};
type AuditEvent = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
};
type Governance = {
  retentionDays: number;
  events: AuditEvent[];
  nextCursor: string | null;
};
type Run = {
  id: string;
  status: string;
  createdAt: string;
  error?: string | null;
  results: Array<{
    id: string;
    statusCode: number | null;
    durationMs: number;
    error: string | null;
    passed: boolean;
    testRequest: { name: string; method: string; url: string };
  }>;
};

async function request<T>(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed");
  return body as T;
}

export default function Workspace() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState("");
  const [secretEnvironmentId, setSecretEnvironmentId] = useState("");
  const [secrets, setSecrets] = useState<EnvironmentSecret[]>([]);
  const [specifications, setSpecifications] = useState<Specification[]>([]);
  const [reference, setReference] = useState<Reference | null>(null);
  const [specificationId, setSpecificationId] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  const [diff, setDiff] = useState<Diff | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [governance, setGovernance] = useState<Governance | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [notificationRules, setNotificationRules] = useState<
    NotificationRule[]
  >([]);
  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [document, setDocument] = useState("");
  async function load(activeToken: string) {
    const items = await request<Organization[]>("/organizations", activeToken);
    setOrganizations(items);
    setOrganizationId((current) => current || items[0]?.id || "");
  }
  async function loadProjects(activeToken: string, id: string) {
    if (!id) return setProjects([]);
    const items = await request<Project[]>(
      `/organizations/${id}/projects`,
      activeToken,
    );
    setProjects(items);
    setProjectId((current) =>
      items.some((p) => p.id === current) ? current : items[0]?.id || "",
    );
  }
  async function loadSpecifications(activeToken: string, id: string) {
    if (!id) {
      setSpecifications([]);
      return;
    }
    setSpecifications(
      await request<Specification[]>(
        `/projects/${id}/specifications`,
        activeToken,
      ),
    );
  }
  async function loadVersions(activeToken: string, id: string) {
    if (!id) {
      setVersions([]);
      return;
    }
    const items = await request<Version[]>(
      `/specifications/${id}/versions`,
      activeToken,
    );
    setVersions(items);
    setFromVersion(items[1]?.version.toString() ?? "");
    setToVersion(items[0]?.version.toString() ?? "");
    setDiff(null);
  }
  async function loadCollections(activeToken: string, id: string) {
    if (!id) {
      setCollections([]);
      return;
    }
    const items = await request<Collection[]>(
      `/projects/${id}/collections`,
      activeToken,
    );
    setCollections(items);
    setCollectionId((current) =>
      items.some((item) => item.id === current)
        ? current
        : (items[0]?.id ?? ""),
    );
  }
  async function loadEnvironments(activeToken: string, id: string) {
    if (!id) return setEnvironments([]);
    const items = await request<Environment[]>(
      `/projects/${id}/environments`,
      activeToken,
    );
    setEnvironments(items);
    setSecretEnvironmentId((current) =>
      items.some((item) => item.id === current)
        ? current
        : (items[0]?.id ?? ""),
    );
  }
  async function loadSecrets(activeToken: string, id: string) {
    if (!id) return setSecrets([]);
    setSecrets(
      await request<EnvironmentSecret[]>(
        `/environments/${id}/secrets`,
        activeToken,
      ),
    );
  }
  async function loadOverview(activeToken: string, id: string) {
    if (!id) return setOverview(null);
    setOverview(
      await request<ProjectOverview>(`/projects/${id}/overview`, activeToken),
    );
  }
  async function loadGovernance(activeToken: string, id: string) {
    if (!id) return setGovernance(null);
    setGovernance(
      await request<Governance>(`/projects/${id}/governance`, activeToken),
    );
  }
  async function loadHistory(
    activeToken: string,
    id: string,
    cursor?: string,
  ) {
    if (!id) {
      setHistory([]);
      setHistoryCursor(null);
      return;
    }
    const items = await request<Run[]>(
      `/collections/${id}/runs?limit=10${cursor ? `&cursor=${cursor}` : ""}`,
      activeToken,
    );
    setHistory((current) => (cursor ? [...current, ...items] : items));
    setHistoryCursor(items.length === 10 ? items.at(-1)?.id ?? null : null);
  }
  async function loadSchedules(activeToken: string, id: string) {
    if (!id) return setSchedules([]);
    setSchedules(
      await request<Schedule[]>(`/collections/${id}/schedules`, activeToken),
    );
  }
  async function loadNotificationRules(activeToken: string, id: string) {
    if (!id) return setNotificationRules([]);
    setNotificationRules(
      await request<NotificationRule[]>(
        `/collections/${id}/notification-rules`,
        activeToken,
      ),
    );
  }
  useEffect(() => {
    const saved = localStorage.getItem("api-sentinel-token");
    if (saved)
      request<{ user: User }>("/auth/me", saved)
        .then(({ user: me }) => {
          setToken(saved);
          setUser(me);
          return load(saved);
        })
        .catch(() => localStorage.removeItem("api-sentinel-token"));
  }, []);
  useEffect(() => {
    if (token) void loadProjects(token, organizationId);
  }, [token, organizationId]);
  useEffect(() => {
    if (token) void loadSpecifications(token, projectId);
  }, [token, projectId]);
  useEffect(() => {
    if (token) void loadOverview(token, projectId);
  }, [token, projectId]);
  useEffect(() => {
    if (token) void loadGovernance(token, projectId);
  }, [token, projectId]);
  useEffect(() => {
    if (token) void loadCollections(token, projectId);
  }, [token, projectId]);
  useEffect(() => {
    if (token) void loadEnvironments(token, projectId);
  }, [token, projectId]);
  useEffect(() => {
    if (token) void loadSecrets(token, secretEnvironmentId);
  }, [token, secretEnvironmentId]);
  useEffect(() => {
    if (token) void loadHistory(token, collectionId);
  }, [token, collectionId]);
  useEffect(() => {
    if (token) void loadSchedules(token, collectionId);
  }, [token, collectionId]);
  useEffect(() => {
    if (token) void loadNotificationRules(token, collectionId);
  }, [token, collectionId]);
  useEffect(() => {
    if (token) void loadVersions(token, specificationId);
  }, [token, specificationId]);
  async function auth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ token: string; user: User }>(
        authMode === "login" ? "/auth/login" : "/auth/register",
        undefined,
        {
          method: "POST",
          body: JSON.stringify({
            ...(authMode === "register" ? { name: form.get("name") } : {}),
            email: form.get("email"),
            password: form.get("password"),
          }),
        },
      );
      localStorage.setItem("api-sentinel-token", result.token);
      setToken(result.token);
      setUser(result.user);
      await load(result.token);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : authMode === "login"
            ? "Unable to sign in"
            : "Unable to create account",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    const activeToken = token;
    try {
      if (activeToken)
        await request("/auth/logout", activeToken, { method: "POST" });
    } catch {
      // Local sign-out must still succeed when the session is already invalid.
    } finally {
      localStorage.removeItem("api-sentinel-token");
      setToken(null);
      setUser(null);
      setMessage("");
      setAuthMode("login");
    }
  }
  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      await request("/organizations", token, {
        method: "POST",
        body: JSON.stringify({ name: form.get("name") }),
      });
      await load(token);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to create organization",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !organizationId) return;
    const form = new FormData(event.currentTarget);
    await request(`/organizations/${organizationId}/projects`, token, {
      method: "POST",
      body: JSON.stringify({ name: form.get("name") }),
    });
    await loadProjects(token, organizationId);
    event.currentTarget.reset();
  }
  async function createEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !projectId) return;
    try {
      const form = new FormData(event.currentTarget);
      await request(`/projects/${projectId}/environments`, token, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          baseUrl: form.get("baseUrl"),
        }),
      });
      await loadEnvironments(token, projectId);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create environment",
      );
    }
  }
  async function updateEnvironment(
    event: FormEvent<HTMLFormElement>,
    environmentId: string,
  ) {
    event.preventDefault();
    if (!token || !projectId) return;
    try {
      const form = new FormData(event.currentTarget);
      await request(`/environments/${environmentId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          baseUrl: form.get("baseUrl"),
        }),
      });
      await loadEnvironments(token, projectId);
      setEditingEnvironmentId("");
      setMessage("Environment updated successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update environment",
      );
    }
  }
  async function saveSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !secretEnvironmentId) return;
    try {
      const form = new FormData(event.currentTarget);
      await request(`/environments/${secretEnvironmentId}/secrets`, token, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          value: form.get("value"),
        }),
      });
      await loadSecrets(token, secretEnvironmentId);
      setMessage("Secret saved securely. Its value cannot be read back.");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save secret",
      );
    }
  }
  async function importSpec(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !projectId) return;
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      await request(`/projects/${projectId}/specifications/imports`, token, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          document: JSON.parse(document),
        }),
      });
      await loadSpecifications(token, projectId);
      setMessage("Specification imported successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to import specification",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openReference(versionId: string) {
    if (!token) return;
    try {
      setReference(
        await request<Reference>(
          `/specification-versions/${versionId}/reference`,
          token,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load API reference",
      );
    }
  }
  async function generateCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reference) return;
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const created = await request<{ generatedCount: number }>(
        `/specification-versions/${reference.id}/collections`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            baseUrl: form.get("baseUrl"),
            name: form.get("name") || undefined,
          }),
        },
      );
      await loadCollections(token, projectId);
      await loadOverview(token, projectId);
      setMessage(`${created.generatedCount} smoke test request(s) created.`);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate test collection",
      );
    } finally {
      setBusy(false);
    }
  }
  async function compareVersions() {
    if (!token || !specificationId || !fromVersion || !toVersion) return;
    try {
      setDiff(
        await request<Diff>(
          `/specifications/${specificationId}/diff?from=${fromVersion}&to=${toVersion}`,
          token,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to compare versions",
      );
    }
  }
  async function createCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !projectId) return;
    try {
      const form = new FormData(event.currentTarget);
      await request(`/projects/${projectId}/collections`, token, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          environmentId: form.get("environmentId") || undefined,
        }),
      });
      await loadCollections(token, projectId);
      await loadOverview(token, projectId);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create collection",
      );
    }
  }
  async function addRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !collectionId) return;
    try {
      const form = new FormData(event.currentTarget);
      const optional = (name: string) =>
        String(form.get(name) ?? "").trim() || undefined;
      const headers = optional("headers");
      if (headers) JSON.parse(headers);
      await request(`/collections/${collectionId}/requests`, token, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          method: form.get("method"),
          url: form.get("url"),
          expectedStatus: Number(form.get("expectedStatus")),
          expectedHeaderName: optional("expectedHeaderName"),
          expectedHeaderValue: optional("expectedHeaderValue"),
          jsonPath: optional("jsonPath"),
          expectedJsonValue: optional("expectedJsonValue"),
          maxDurationMs: optional("maxDurationMs")
            ? Number(optional("maxDurationMs"))
            : undefined,
          headers: headers ? JSON.parse(headers) : undefined,
          body: optional("body"),
        }),
      });
      await loadCollections(token, projectId);
      await loadOverview(token, projectId);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to add request",
      );
    }
  }
  async function runCollection() {
    if (!token || !collectionId) return;
    setBusy(true);
    try {
      const createdRun = await request<Run>(
        `/collections/${collectionId}/runs`,
        token,
        { method: "POST" },
      );
      setRun(createdRun);
      let completedRun = createdRun;
      for (
        let attempt = 0;
        attempt < 30 && ["QUEUED", "RUNNING"].includes(completedRun.status);
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        completedRun = await request<Run>(`/runs/${createdRun.id}`, token);
        setRun(completedRun);
      }
      await loadHistory(token, collectionId);
      await loadOverview(token, projectId);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to run collection",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !collectionId) return;
    try {
      const form = new FormData(event.currentTarget);
      await request(`/collections/${collectionId}/schedules`, token, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          cron: form.get("cron"),
          timezone: form.get("timezone"),
        }),
      });
      await loadSchedules(token, collectionId);
      await loadOverview(token, projectId);
      await loadGovernance(token, projectId);
      setMessage("Schedule created. The first run may be queued immediately.");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create schedule",
      );
    }
  }
  async function toggleSchedule(schedule: Schedule) {
    if (!token) return;
    try {
      await request(`/schedules/${schedule.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !schedule.enabled }),
      });
      await loadSchedules(token, collectionId);
      await loadOverview(token, projectId);
      await loadGovernance(token, projectId);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update schedule",
      );
    }
  }
  async function createNotificationRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !collectionId) return;
    try {
      const form = new FormData(event.currentTarget);
      const signingSecret = String(form.get("signingSecret") ?? "").trim();
      await request(`/collections/${collectionId}/notification-rules`, token, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          endpoint: form.get("endpoint"),
          signingSecret: signingSecret || undefined,
        }),
      });
      await loadNotificationRules(token, collectionId);
      await loadGovernance(token, projectId);
      setMessage("Webhook alert saved securely.");
      event.currentTarget.reset();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create webhook",
      );
    }
  }
  async function toggleNotificationRule(rule: NotificationRule) {
    if (!token) return;
    try {
      await request(`/notification-rules/${rule.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      await loadNotificationRules(token, collectionId);
      await loadGovernance(token, projectId);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update webhook",
      );
    }
  }
  async function updateRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !projectId) return;
    try {
      const form = new FormData(event.currentTarget);
      await request(`/projects/${projectId}/retention`, token, {
        method: "PATCH",
        body: JSON.stringify({
          retentionDays: Number(form.get("retentionDays")),
        }),
      });
      await loadGovernance(token, projectId);
      setMessage("Run retention policy updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update retention",
      );
    }
  }
  if (!user)
    return (
      <main className="workspace auth">
        <nav>
          <Link href="/">API Sentinel</Link>
        </nav>
        <section className="panel">
          <p className="eyebrow">
            {authMode === "login" ? "WELCOME BACK" : "GET STARTED"}
          </p>
          <h1>
            {authMode === "login" ? "Sign in to your workspace" : "Create your workspace"}
          </h1>
          <div className="auth-switch" aria-label="Authentication mode">
            <button
              type="button"
              className={authMode === "login" ? "button" : "button secondary"}
              aria-pressed={authMode === "login"}
              onClick={() => {
                setAuthMode("login");
                setMessage("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={authMode === "register" ? "button" : "button secondary"}
              aria-pressed={authMode === "register"}
              onClick={() => {
                setAuthMode("register");
                setMessage("");
              }}
            >
              Create account
            </button>
          </div>
          <form onSubmit={auth}>
            {authMode === "register" && (
              <label>
                Name
                <input name="name" autoComplete="name" required />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>
            <button className="button" disabled={busy}>
              {busy
                ? authMode === "login"
                  ? "Signing in…"
                  : "Creating…"
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
          {message && <p className="notice">{message}</p>}
        </section>
      </main>
    );
  return (
    <main className="workspace">
      <nav>
        <Link href="/">API Sentinel</Link>
        <span className="muted">{user.email}</span>
        <button
          className="link-button"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </nav>
      <header>
        <p className="eyebrow">WORKSPACE</p>
        <h1>Import and review your API contracts.</h1>
      </header>
      <section className="workspace-grid">
        <article className="panel">
          <h2>Organization</h2>
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            <option value="">Select organization</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.members[0]?.role})
              </option>
            ))}
          </select>
          <form onSubmit={createOrganization}>
            <label>
              New organization
              <input name="name" minLength={2} required />
            </label>
            <button className="button secondary" disabled={busy}>
              Create
            </button>
          </form>
        </article>
        <article className="panel">
          <h2>Project</h2>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!organizationId}
          >
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <form onSubmit={createProject}>
            <label>
              New project
              <input
                name="name"
                minLength={2}
                required
                disabled={!organizationId}
              />
            </label>
            <button className="button secondary" disabled={!organizationId}>
              Create
            </button>
          </form>
        </article>
      </section>
      {overview && (
        <section className="panel">
          <p className="eyebrow">PROJECT OVERVIEW · LAST 24 HOURS</p>
          <h2>API reliability at a glance</h2>
          <div className="workspace-grid">
            <div>
              <strong>{overview.last24Hours.passRate ?? "—"}%</strong>
              <p className="muted">pass rate</p>
            </div>
            <div>
              <strong>{overview.last24Hours.total}</strong>
              <p className="muted">
                runs · {overview.last24Hours.failed} failed
              </p>
            </div>
            <div>
              <strong>
                {overview.last24Hours.averageRequestDurationMs ?? "—"}ms
              </strong>
              <p className="muted">average request duration</p>
            </div>
            <div>
              <strong>{overview.counts.activeSchedules}</strong>
              <p className="muted">
                active schedules · {overview.counts.collections} collections ·{" "}
                {overview.counts.requests} requests
              </p>
            </div>
          </div>
          {overview.recentRuns.length > 0 && (
            <div>
              <h3>Recent project runs</h3>
              {overview.recentRuns.map((item) => (
                <p key={item.id}>
                  {item.status === "PASSED" ? "✅" : item.status === "FAILED" ? "❌" : "⏳"}{" "}
                  <strong>{item.collection.name}</strong> · {item.status} ·{" "}
                  {item._count.results} result(s) ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
      {governance && (
        <section className="panel">
          <p className="eyebrow">GOVERNANCE</p>
          <h2>Retention and audit trail</h2>
          <form onSubmit={updateRetention}>
            <label>
              Keep completed runs for
              <select
                name="retentionDays"
                key={governance.retentionDays}
                defaultValue={governance.retentionDays}
              >
                {[7, 30, 90, 180, 365].map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              Cleanup runs daily at 03:00 UTC. Queued and running executions
              are always preserved.
            </p>
            <button className="button secondary">Update retention</button>
          </form>
          <h3>Recent configuration activity</h3>
          {governance.events.length === 0 ? (
            <p className="muted">No audited changes yet.</p>
          ) : (
            governance.events.map((event) => (
              <p key={event.id}>
                <strong>{event.action}</strong> ·{" "}
                {event.actor?.name ?? event.actor?.email ?? "Deleted user"} ·{" "}
                {new Date(event.createdAt).toLocaleString()}
              </p>
            ))
          )}
        </section>
      )}
      <section className="panel">
        <p className="eyebrow">ENVIRONMENTS</p>
        <h2>Configure a base URL</h2>
        <form onSubmit={createEnvironment}>
          <label>
            Environment name
            <input
              name="name"
              placeholder="staging"
              required
              disabled={!projectId}
            />
          </label>
          <label>
            Base URL
            <input
              name="baseUrl"
              type="url"
              placeholder="https://staging.api.example.com"
              required
              disabled={!projectId}
            />
          </label>
          <button className="button secondary" disabled={!projectId}>
            Create environment
          </button>
        </form>
        {environments.map((environment) =>
          editingEnvironmentId === environment.id ? (
            <form
              key={environment.id}
              className="environment-editor"
              onSubmit={(event) => updateEnvironment(event, environment.id)}
            >
              <label>
                Environment name
                <input name="name" defaultValue={environment.name} required />
              </label>
              <label>
                Base URL
                <input
                  name="baseUrl"
                  type="url"
                  defaultValue={environment.baseUrl}
                  required
                />
              </label>
              <div className="button-row">
                <button className="button secondary">Save changes</button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setEditingEnvironmentId("")}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="environment-row" key={environment.id}>
              <p>
                <strong>{environment.name}</strong>{" "}
                <code>{environment.baseUrl}</code>
              </p>
              <button
                type="button"
                className="link-button"
                onClick={() => setEditingEnvironmentId(environment.id)}
              >
                Edit
              </button>
            </div>
          ),
        )}
        {environments.length > 0 && (
          <form onSubmit={saveSecret}>
            <label>
              Secret environment
              <select
                value={secretEnvironmentId}
                onChange={(event) => setSecretEnvironmentId(event.target.value)}
              >
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environment.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Secret name
              <input
                name="name"
                placeholder="token"
                pattern="[A-Za-z_][A-Za-z0-9_]*"
                required
              />
            </label>
            <label>
              Secret value
              <input
                name="value"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <p className="muted">
              Use it as <code>{"{{token}}"}</code> in request headers or body.
              The value is encrypted and cannot be read back.
            </p>
            <button className="button secondary">Save secret</button>
          </form>
        )}
        {secrets.map((secret) => (
          <p key={secret.id}>
            🔒 <code>{`{{${secret.name}}}`}</code>{" "}
            <span className="muted">value hidden</span>
          </p>
        ))}
      </section>
      <section className="panel">
        <p className="eyebrow">TEST COLLECTIONS</p>
        <h2>Run an API check</h2>
        <form onSubmit={createCollection}>
          <label>
            Collection name
            <input
              name="name"
              placeholder="Smoke tests"
              required
              disabled={!projectId}
            />
          </label>
          <label>
            Environment
            <select name="environmentId" disabled={!projectId}>
              <option value="">No environment</option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name} — {environment.baseUrl}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary" disabled={!projectId}>
            Create collection
          </button>
        </form>
        {collections.length > 0 && (
          <>
            <label>
              Collection
              <select
                aria-label="Collection"
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
              >
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
            <form onSubmit={addRequest}>
              <label>
                Request name
                <input name="name" placeholder="Health check" required />
              </label>
              <label>
                Method
                <select name="method" defaultValue="GET">
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
              </label>
              <label>
                Public HTTPS URL
                <input
                  name="url"
                  type="url"
                  placeholder="https://api.example.com/health"
                  required
                />
              </label>
              <label>
                Expected status
                <input
                  name="expectedStatus"
                  type="number"
                  defaultValue="200"
                  min="100"
                  max="599"
                  required
                />
              </label>
              <label>
                Request headers (JSON)
                <textarea
                  name="headers"
                  placeholder={
                    'Optional, e.g. {"content-type":"application/json"}'
                  }
                />
              </label>
              <label>
                Request body
                <textarea
                  name="body"
                  placeholder={'Optional JSON/text body, e.g. {"name":"Ada"}'}
                />
              </label>
              <label>
                Maximum response time (ms)
                <input
                  name="maxDurationMs"
                  type="number"
                  min="1"
                  max="10000"
                  placeholder="Optional, e.g. 800"
                />
              </label>
              <label>
                Expected header name
                <input
                  name="expectedHeaderName"
                  placeholder="Optional, e.g. content-type"
                />
              </label>
              <label>
                Expected header value
                <input
                  name="expectedHeaderValue"
                  placeholder="Exact value, e.g. application/json"
                />
              </label>
              <label>
                JSON path
                <input
                  name="jsonPath"
                  placeholder="Optional, e.g. $.slideshow.title"
                />
              </label>
              <label>
                Expected JSON value
                <input
                  name="expectedJsonValue"
                  placeholder={'JSON literal, e.g. "Sample Slide Show"'}
                />
              </label>
              <p className="muted">
                JSON value must be valid JSON: use <code>"text"</code>,{" "}
                <code>true</code>, or <code>42</code>. Header and JSON
                assertions need both fields.
              </p>
              <button className="button secondary">Add request</button>
            </form>
            <button
              className="button"
              disabled={busy || !collectionId}
              onClick={runCollection}
            >
              {busy ? "Running…" : "Run collection"}
            </button>
          </>
        )}
        {run && (
          <div>
            <p>
              <strong>{run.status}</strong>
              {run.error && <small className="muted"> — {run.error}</small>}
            </p>
            {run.results.map((result) => (
              <p key={result.id}>
                {result.passed ? "✅" : "❌"}{" "}
                <strong>{result.testRequest.name}</strong> —{" "}
                {result.statusCode ?? "no response"} · {result.durationMs}ms
                {result.error && (
                  <small className="muted"> — {result.error}</small>
                )}
              </p>
            ))}
          </div>
        )}
        {history.length > 0 && (
          <div>
            <p className="eyebrow">RUN HISTORY</p>
            <h3>Latest executions</h3>
            {history.map((item) => (
              <details key={item.id}>
                <summary>
                  <strong>{item.status}</strong> ·{" "}
                  {new Date(item.createdAt).toLocaleString()} ·{" "}
                  {item.results.filter((result) => result.passed).length}/
                  {item.results.length} passed
                </summary>
                {item.results.map((result) => (
                  <p key={result.id}>
                    {result.passed ? "✅" : "❌"}{" "}
                    <strong>{result.testRequest.name}</strong> —{" "}
                    {result.statusCode ?? "no response"} · {result.durationMs}ms
                    {result.error && (
                      <small className="muted"> — {result.error}</small>
                    )}
                  </p>
                ))}
              </details>
            ))}
            {historyCursor && (
              <button
                className="button secondary"
                onClick={() =>
                  token && void loadHistory(token, collectionId, historyCursor)
                }
              >
                Load older runs
              </button>
            )}
          </div>
        )}
        {collectionId && (
          <div>
            <p className="eyebrow">SCHEDULES</p>
            <h3>Automate collection runs</h3>
            <form onSubmit={createSchedule}>
              <label>
                Schedule name
                <input name="name" placeholder="Every five minutes" required />
              </label>
              <label>
                Cron expression
                <input name="cron" defaultValue="0 */5 * * * *" required />
              </label>
              <label>
                Timezone
                <input name="timezone" defaultValue="Asia/Jakarta" required />
              </label>
              <p className="muted">
                BullMQ cron supports an optional seconds field. New schedules
                may enqueue their first run immediately.
              </p>
              <button className="button secondary">Create schedule</button>
            </form>
            {schedules.map((schedule) => (
              <p key={schedule.id}>
                <strong>{schedule.enabled ? "ACTIVE" : "PAUSED"}</strong>{" "}
                {schedule.name} · <code>{schedule.cron}</code> ·{" "}
                {schedule.timezone}{" "}
                <button
                  className="link-button"
                  onClick={() => toggleSchedule(schedule)}
                >
                  {schedule.enabled ? "Pause" : "Enable"}
                </button>
              </p>
            ))}
          </div>
        )}
        {collectionId && (
          <div>
            <p className="eyebrow">ALERTS</p>
            <h3>Notify your systems when a run fails</h3>
            <form onSubmit={createNotificationRule}>
              <label>
                Alert name
                <input name="name" placeholder="Incident webhook" required />
              </label>
              <label>
                HTTPS endpoint
                <input
                  name="endpoint"
                  type="url"
                  placeholder="https://example.com/hooks/…"
                  required
                />
              </label>
              <label>
                Signing secret (optional)
                <input
                  name="signingSecret"
                  type="password"
                  minLength={16}
                  autoComplete="new-password"
                />
              </label>
              <p className="muted">
                The full URL and signing secret are encrypted and cannot be
                read back. Failed deliveries retry up to three times.
              </p>
              <button className="button secondary">Create webhook alert</button>
            </form>
            {notificationRules.map((rule) => (
              <details key={rule.id}>
                <summary>
                  <strong>{rule.enabled ? "ACTIVE" : "PAUSED"}</strong> {rule.name}{" "}
                  · {rule.endpointOrigin}{" "}
                  <button
                    className="link-button"
                    onClick={(event) => {
                      event.preventDefault();
                      void toggleNotificationRule(rule);
                    }}
                  >
                    {rule.enabled ? "Pause" : "Enable"}
                  </button>
                </summary>
                {rule.deliveries.length === 0 ? (
                  <p className="muted">No delivery attempts yet.</p>
                ) : (
                  rule.deliveries.map((delivery) => (
                    <p key={delivery.id}>
                      {delivery.status === "DELIVERED" ? "✅" : "❌"}{" "}
                      attempt {delivery.attempt} · HTTP{" "}
                      {delivery.responseStatus ?? "no response"} ·{" "}
                      {delivery.durationMs}ms ·{" "}
                      {new Date(delivery.createdAt).toLocaleString()}
                      {delivery.error && (
                        <small className="muted"> — {delivery.error}</small>
                      )}
                    </p>
                  ))
                )}
              </details>
            ))}
          </div>
        )}
      </section>
      <section className="panel import-panel">
        <h2>Import OpenAPI 3.x</h2>
        <form onSubmit={importSpec}>
          <label>
            Specification name
            <input name="name" placeholder="Pet API" required />
          </label>
          <label>
            OpenAPI JSON
            <textarea
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              placeholder={OPENAPI_EXAMPLE}
              required
            />
          </label>
          <button className="button" disabled={busy || !projectId}>
            {busy ? "Importing…" : "Import specification"}
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Specifications</h2>
        {specifications.length === 0 ? (
          <p className="muted">
            Import a specification to see its versioned API reference.
          </p>
        ) : (
          specifications.map((spec) => (
            <div key={spec.id}>
              <strong>{spec.name}</strong>{" "}
              <button
                className="link-button"
                onClick={() => setSpecificationId(spec.id)}
              >
                Compare versions
              </button>
              {spec.versions.map((version) => (
                <p key={version.id}>
                  {version.title} v{version.apiVersion}{" "}
                  <button
                    className="link-button"
                    onClick={() => openReference(version.id)}
                  >
                    Open reference
                  </button>
                </p>
              ))}
            </div>
          ))
        )}
      </section>
      {versions.length > 0 && (
        <section className="panel">
          <p className="eyebrow">CHANGE REPORT</p>
          <h2>Compare versions</h2>
          <div className="workspace-grid">
            <label>
              From
              <select
                value={fromVersion}
                onChange={(e) => setFromVersion(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    Version {v.version} — {v.apiVersion}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <select
                value={toVersion}
                onChange={(e) => setToVersion(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    Version {v.version} — {v.apiVersion}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="button"
            disabled={!fromVersion || !toVersion || fromVersion === toVersion}
            onClick={compareVersions}
          >
            Compare versions
          </button>
          {diff && (
            <div>
              <p>
                <strong>{diff.summary.breaking}</strong> breaking change(s) ·{" "}
                {diff.summary.total} total
              </p>
              {diff.changes.length === 0 ? (
                <p className="notice">No changes detected.</p>
              ) : (
                diff.changes.map((change) => (
                  <p key={`${change.code}-${change.location}`}>
                    <strong>{change.severity}</strong>{" "}
                    <code>{change.location}</code> {change.message}
                  </p>
                ))
              )}
            </div>
          )}
        </section>
      )}
      {reference && (
        <section className="panel">
          <h2>
            {reference.title}{" "}
            <span className="muted">v{reference.apiVersion}</span>
          </h2>
          <p className="muted">{reference.operationCount} operation(s)</p>
          <form onSubmit={generateCollection}>
            <label>
              API base URL
              <input
                name="baseUrl"
                type="url"
                placeholder="https://api.example.com"
                required
              />
            </label>
            <label>
              Collection name
              <input
                name="name"
                placeholder={`${reference.title} smoke tests`}
              />
            </label>
            <p className="muted">
              Creates GET smoke tests without path parameters.
              POST/PUT/PATCH/DELETE and paths such as{" "}
              <code>/users/&#123;id&#125;</code> are skipped.
            </p>
            <button className="button secondary" disabled={busy}>
              {busy ? "Creating…" : "Create smoke tests from OpenAPI"}
            </button>
          </form>
          {reference.operations.map((operation) => (
            <p key={`${operation.method}-${operation.path}`}>
              <strong>{operation.method}</strong> <code>{operation.path}</code>{" "}
              {operation.summary ?? ""}{" "}
              <span className="muted">
                {operation.responseCodes.join(", ")}
              </span>
            </p>
          ))}
        </section>
      )}
      {message && <p className="notice">{message}</p>}
    </main>
  );
}
