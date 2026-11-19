import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden>
              <svg viewBox="0 0 32 32" width="22" height="22"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M9 11h14M9 16h14M9 21h9" stroke="var(--bg)" strokeWidth="2.5" strokeLinecap="round" /></svg>
            </span>
            Skill Bank
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">Skills are sourced from public GitHub repositories and belong to their authors.</div>
      </footer>
    </>
  );
}
