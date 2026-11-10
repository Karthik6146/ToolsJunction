import { Suspense, useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES, catOf, toolById, tools, type Category } from './tools/registry';

const tint = (color: string, more?: CSSProperties) => ({ '--c': color, ...more }) as CSSProperties;

// the hover highlight on a tool card follows the cursor
function spot(e: MouseEvent<HTMLElement>) {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}

const ToolIcon = ({ d }: { d: string }) => (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  // 'default' key = first page of this visit, so there is no history to go back to
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate('/'));
  return (
    <header className="top">
      <div className="top-left">
        {location.pathname !== '/' && (
          <button className="back-btn" onClick={back} aria-label="Go back" title="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <Link to="/" className="brand"><span className="logo">TJ</span><span>Tools<b>Junction</b></span></Link>
      </div>
      <span className="tag">Free · No sign-up · Works offline</span>
    </header>
  );
}

function Home() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  useEffect(() => { document.title = 'ToolsJunction – Free Image & PDF Tools'; }, []);
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    return CATEGORIES.filter((c) => cat === 'all' || c.id === cat)
      .map((c) => ({ ...c, items: tools.filter((t) => t.category === c.id && (!s || `${t.name} ${t.description}`.toLowerCase().includes(s))) }))
      .filter((g) => g.items.length);
  }, [q, cat]);
  return (
    <main className="wrap" onMouseMove={spot}>
      <section className="hero">
        <div>
          <h1>{tools.length} image and PDF tools that run on your device</h1>
          <p>Resize, convert, merge, sign and protect without uploading a file</p>
        </div>
        <input className="search" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" />
      </section>
      <nav className="chips" aria-label="Categories">
        <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </nav>
      {groups.map((g, i) => (
        <section key={g.id} className="group" style={tint(g.color, { animationDelay: `${Math.min(i, 5) * 50}ms` })} aria-labelledby={`group-${g.id}`}>
          <header className="group-head">
            <h2 id={`group-${g.id}`}>{g.name}</h2>
            <span className="count">{g.items.length}</span>
          </header>
          <div className="grid">
            {g.items.map((t) => (
              <Link key={t.id} to={`/tool/${t.id}`} className="card">
                <ToolIcon d={t.icon} />
                <div>
                  <h3>{t.name}</h3>
                  <p>{t.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className="muted">No tools match "{q}"</p>}
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
      <div className="tool-head" style={tint(catOf(tool.category).color)}>
        <ToolIcon d={tool.icon} />
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
        ToolsJunction · Files are processed on this device · <a href="https://github.com/Karthik6146/ToolsJunction" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </>
  );
}
