import { Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { CATEGORIES, catOf, toolById, tools, type Category } from './tools/registry';

function Header() {
  return (
    <header className="top">
      <Link to="/" className="brand"><span className="logo">TJ</span><span>Tools<b>Junction</b></span></Link>
      <span className="tag">Free · Private · Runs on your device</span>
    </header>
  );
}

function Home() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  useEffect(() => { document.title = 'ToolsJunction – Free Image & PDF Tools'; }, []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tools.filter((t) => (cat === 'all' || t.category === cat) && (!s || `${t.name} ${t.description}`.toLowerCase().includes(s)));
  }, [q, cat]);
  return (
    <main className="wrap">
      <section className="hero">
        <h1>Every image & PDF tool you need, in one place</h1>
        <p>Resize, edit, convert, merge, sign and protect. Your files never leave your device.</p>
        <input className="search" type="search" placeholder={`Search ${tools.length} tools…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" />
      </section>
      <nav className="chips" aria-label="Categories">
        <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </nav>
      <div className="grid">
        {list.map((t) => (
          <Link key={t.id} to={`/tool/${t.id}`} className="card">
            <span className="ico" style={{ background: catOf(t.category).color }}>{t.icon}</span>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
          </Link>
        ))}
        {!list.length && <p className="muted">No tools match "{q}".</p>}
      </div>
    </main>
  );
}

function ToolPage() {
  const { id = '' } = useParams();
  const tool = toolById(id);
  useEffect(() => { if (tool) document.title = `${tool.name} – ToolsJunction`; }, [tool]);
  if (!tool) return <main className="wrap"><p>Tool not found. <Link to="/">Back to all tools</Link></p></main>;
  const C = tool.component;
  return (
    <main className="wrap tool">
      <Link to="/" className="back">← All tools</Link>
      <div className="tool-head">
        <span className="ico" style={{ background: catOf(tool.category).color }}>{tool.icon}</span>
        <div>
          <h1>{tool.name}</h1>
          <p className="muted">{tool.description}</p>
        </div>
      </div>
      <Suspense fallback={<div className="status busy"><span className="spin" /> Loading tool…</div>}>
        <C key={tool.id} />
      </Suspense>
    </main>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tool/:id" element={<ToolPage />} />
      </Routes>
      <footer className="foot">
        ToolsJunction · All processing happens locally in your browser · <a href="https://github.com/Karthik6146/ToolsJunction" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </>
  );
}
