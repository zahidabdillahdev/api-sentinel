"use client";

import { FormEvent, useEffect, useState } from "react";

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
      "content-type": "application/json",
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
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
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
  const [organizationId, setOrganizationId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [document, setDocument] = useState(
    '{\n  "openapi": "3.0.3",\n  "info": { "title": "Pet API", "version": "1.0.0" },\n  "paths": {}\n}',
  );
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
  async function loadHistory(activeToken: string, id: string) {
    if (!id) {
      setHistory([]);
      return;
    }
    setHistory(
      await request<Run[]>(`/collections/${id}/runs?limit=10`, activeToken),
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
    if (token) void loadVersions(token, specificationId);
  }, [token, specificationId]);
  async function auth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ token: string; user: User }>(
        "/auth/register",
        undefined,
        {
          method: "POST",
          body: JSON.stringify({
            name: form.get("name"),
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
      setMessage(error instanceof Error ? error.message : "Unable to register");
    } finally {
      setBusy(false);
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
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to run collection",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!user)
    return (
      <main className="workspace auth">
        <nav>
          <a href="/">API Sentinel</a>
        </nav>
        <section className="panel">
          <p className="eyebrow">GET STARTED</p>
          <h1>Create your workspace</h1>
          <form onSubmit={auth}>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" minLength={12} required />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
          {message && <p className="notice">{message}</p>}
        </section>
      </main>
    );
  return (
    <main className="workspace">
      <nav>
        <a href="/">API Sentinel</a>
        <span className="muted">{user.email}</span>
        <button
          className="link-button"
          onClick={() => {
            localStorage.removeItem("api-sentinel-token");
            setUser(null);
          }}
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
        {environments.map((environment) => (
          <p key={environment.id}>
            <strong>{environment.name}</strong>{" "}
            <code>{environment.baseUrl}</code>
          </p>
        ))}
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
                <input name="name" defaultValue="Health check" required />
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
                  defaultValue="https://httpbin.org/status/200"
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
          </div>
        )}
      </section>
      <section className="panel import-panel">
        <h2>Import OpenAPI 3.x</h2>
        <form onSubmit={importSpec}>
          <label>
            Specification name
            <input name="name" defaultValue="Pet API" required />
          </label>
          <label>
            OpenAPI JSON
            <textarea
              value={document}
              onChange={(e) => setDocument(e.target.value)}
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
