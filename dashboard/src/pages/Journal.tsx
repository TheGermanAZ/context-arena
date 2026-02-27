import { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NavBar from '../components/NavBar';
import { useJournal } from '../lib/hooks';
import { Skeleton } from '../components/charts';

const OrderedListContext = createContext(false);

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Strip "Week N, Day N:" prefix and "(Feb NN)" suffix for short sidebar labels */
function shortLabel(text: string): string {
  return text
    .replace(/^Week \d+,?\s*Day \d+(?:-\d+)?(?:\s*\(cont\.\))?:\s*/i, '')
    .replace(/\s*\(Feb\s*\d+(?:-\d+)?\)\s*$/, '')
    .trim();
}

export default function Journal() {
  const { data, isLoading, error } = useJournal();
  const [activeSlug, setActiveSlug] = useState<string>('');
  const sidebarRef = useRef<HTMLElement>(null);

  const headings = useMemo(() => {
    if (!data?.content) return [];
    const matches = [...data.content.matchAll(/^## (.+)$/gm)];
    return matches.map((m) => ({ text: m[1], short: shortLabel(m[1]), slug: slugify(m[1]) }));
  }, [data?.content]);

  // Track active section via scroll position
  useEffect(() => {
    if (headings.length === 0) return;
    const HEADER_OFFSET = 100; // sticky header + some breathing room

    function onScroll() {
      const slugs = headings.map((h) => h.slug);
      let current = slugs[0];
      for (const slug of slugs) {
        const el = document.getElementById(slug);
        if (el && el.getBoundingClientRect().top <= HEADER_OFFSET) {
          current = slug;
        }
      }
      setActiveSlug(current);
    }

    onScroll(); // set initial active
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [headings]);

  // Auto-scroll sidebar to keep active item visible
  useEffect(() => {
    if (!activeSlug || !sidebarRef.current) return;
    const btn = sidebarRef.current.querySelector(`[data-slug="${activeSlug}"]`) as HTMLElement | null;
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeSlug]);

  const scrollTo = useCallback((slug: string) => {
    const el = document.getElementById(slug);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/60">
        <div className="max-w-[90rem] mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-100">Project Journal</h1>
          <NavBar />
        </div>
      </header>

      {/* Sidebar + Content */}
      <div className="max-w-[90rem] mx-auto flex">
        {/* Sidebar */}
        {headings.length > 0 && (
          <aside ref={sidebarRef} className="hidden lg:block w-72 shrink-0 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto border-r border-gray-800/40 py-8 px-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-4 px-2">Sections</p>
            <nav className="flex flex-col gap-0.5">
              {headings.map((h) => (
                <button
                  key={h.slug}
                  data-slug={h.slug}
                  onClick={() => scrollTo(h.slug)}
                  className={`text-left text-xs px-2 py-1.5 rounded transition-colors leading-snug ${
                    activeSlug === h.slug
                      ? 'text-emerald-400 bg-emerald-500/10 font-medium'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
                  }`}
                >
                  {h.short}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Content */}
        <main className="flex-1 min-w-0 max-w-4xl px-6 py-12 mx-auto">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 px-6 py-4 text-red-300">
            Failed to load journal: {error.message}
          </div>
        )}
        {isLoading && <Skeleton className="h-[60vh]" />}
        {data && (
          <article className="journal-prose">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-4xl font-bold text-gray-100 mb-3 mt-0">{children}</h1>
                ),
                h2: ({ children }) => {
                  const text = typeof children === 'string' ? children : String(children);
                  const id = slugify(text);
                  return (
                    <h2 id={id} className="text-2xl font-bold text-gray-100 mt-14 mb-4 pb-2 border-b border-gray-800/50 scroll-mt-20">{shortLabel(text)}</h2>
                  );
                },
                h3: ({ children }) => (
                  <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-3">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-gray-400 text-base leading-relaxed mb-4">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="text-gray-200 font-semibold">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="text-gray-300 italic">{children}</em>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                  >
                    {children}
                  </a>
                ),
                hr: () => (
                  <hr className="border-gray-800/60 my-10" />
                ),
                ul: ({ children }) => (
                  <OrderedListContext.Provider value={false}>
                    <ul className="space-y-1.5 mb-4 ml-1">{children}</ul>
                  </OrderedListContext.Provider>
                ),
                ol: ({ children }) => (
                  <OrderedListContext.Provider value={true}>
                    <ol className="space-y-1.5 mb-4 ml-1 list-decimal pl-5">{children}</ol>
                  </OrderedListContext.Provider>
                ),
                li: function JournalLi({ children }) {
                  const isOrdered = useContext(OrderedListContext);
                  if (isOrdered) {
                    return (
                      <li className="text-gray-400 text-base leading-relaxed">{children}</li>
                    );
                  }
                  return (
                    <li className="text-gray-400 text-base leading-relaxed flex gap-2">
                      <span className="text-emerald-600 mt-0.5 shrink-0">-</span>
                      <span>{children}</span>
                    </li>
                  );
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-amber-500/60 bg-amber-500/5 rounded-r-lg px-5 py-3 mb-4 text-gray-300">
                    {children}
                  </blockquote>
                ),
                code: ({ children, className }) => {
                  const isBlock = className?.startsWith('language-');
                  if (isBlock) {
                    return (
                      <code className="block bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-sm text-gray-300 overflow-x-auto font-mono">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className="bg-gray-800/60 text-emerald-300 text-sm px-1.5 py-0.5 rounded font-mono">
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="mb-4">{children}</pre>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-6 rounded-lg border border-gray-800">
                    <table className="w-full text-sm">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-gray-900/80">{children}</thead>
                ),
                th: ({ children }) => (
                  <th className="text-left text-gray-300 font-medium py-2.5 px-4 border-b border-gray-700">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="text-gray-400 py-2.5 px-4 border-b border-gray-800/50">{children}</td>
                ),
                tr: ({ children }) => (
                  <tr className="hover:bg-gray-800/30 transition-colors">{children}</tr>
                ),
              }}
            >
              {data.content}
            </Markdown>
          </article>
        )}
        </main>
      </div>

      {/* Footer */}
      <footer className="py-12 text-center text-gray-600 text-sm border-t border-gray-800/40">
        Project journal auto-rendered from docs/research/project-journal.md
      </footer>
    </div>
  );
}
