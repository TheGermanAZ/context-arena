import { createContext, useContext } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NavBar from '../components/NavBar';
import { useJournal } from '../lib/hooks';
import { Skeleton } from '../components/charts';

const OrderedListContext = createContext(false);

export default function Journal() {
  const { data, isLoading, error } = useJournal();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/60">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-100">Project Journal</h1>
          <NavBar />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
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
                h2: ({ children }) => (
                  <h2 className="text-2xl font-bold text-gray-100 mt-14 mb-4 pb-2 border-b border-gray-800/50">{children}</h2>
                ),
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

      {/* Footer */}
      <footer className="py-12 text-center text-gray-600 text-sm border-t border-gray-800/40">
        Project journal auto-rendered from docs/research/project-journal.md
      </footer>
    </div>
  );
}
