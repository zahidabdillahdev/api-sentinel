import Link from 'next/link';

const features = [
  ['Versioned specifications', 'Import OpenAPI 3.x documents and retain an immutable version history.'],
  ['Breaking-change reports', 'Understand removed endpoints, responses, parameters, and stricter schema requirements.'],
  ['Repeatable API checks', 'Build collections that run on demand, on a schedule, and in CI.']
];

export default function Home() {
  return <main>
    <nav><strong>API Sentinel</strong><Link className="button secondary" href="/workspace">Open workspace</Link></nav>
    <section className="hero"><p className="eyebrow">SHIP APIs WITH CONFIDENCE</p><h1>Your API quality control center.</h1><p className="lede">Version contracts, detect breaking changes, and make every API check explainable.</p><Link className="button" href="/workspace">Start a project</Link></section>
    <section className="cards">{features.map(([title, copy]) => <article key={title}><h2>{title}</h2><p>{copy}</p></article>)}</section>
  </main>;
}
