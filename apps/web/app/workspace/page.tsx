'use client';

import { FormEvent, useState } from 'react';

type Result = { title?: string; apiVersion?: string; error?: { message: string; details?: unknown } };
const sample = JSON.stringify({ openapi: '3.0.3', info: { title: 'Pet API', version: '1.0.0' }, paths: { '/pets': { get: { responses: { '200': { description: 'OK' } } } } } }, null, 2);

export default function Workspace() {
  const [document, setDocument] = useState(sample); const [message, setMessage] = useState<string>(); const [busy, setBusy] = useState(false);
  async function inspect(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(undefined);
    try {
      const parsed = JSON.parse(document);
      if (!parsed.openapi?.startsWith('3.')) throw new Error('Use a valid OpenAPI 3.x JSON document.');
      setMessage(`Ready to import “${parsed.info?.title ?? 'Untitled API'}” version ${parsed.info?.version ?? 'unknown'}. Connect this page to a project ID to persist it.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid document'); }
    finally { setBusy(false); }
  }
  return <main className="workspace">
    <nav><a href="/">API Sentinel</a><span className="muted">New project workspace</span></nav>
    <header><p className="eyebrow">FIRST VALUE</p><h1>Import an API specification</h1><p>Paste an OpenAPI 3.x document to validate it before importing.</p></header>
    <form onSubmit={inspect}><label htmlFor="document">OpenAPI JSON</label><textarea id="document" value={document} onChange={(event) => setDocument(event.target.value)} spellCheck={false} /><div className="actions"><button className="button" disabled={busy}>{busy ? 'Validating…' : 'Validate specification'}</button></div></form>
    {message && <p className="notice" role="status">{message}</p>}
  </main>;
}
