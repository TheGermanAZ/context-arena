import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/demo', label: 'Story' },
  { to: '/findings', label: 'Findings' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/journal', label: 'Journal' },
] as const;

export default function NavBar() {
  const { pathname } = useLocation();

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Site navigation">
      {LINKS.map(({ to, label }) => {
        const isActive = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              isActive
                ? 'text-gray-100 bg-gray-800'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
