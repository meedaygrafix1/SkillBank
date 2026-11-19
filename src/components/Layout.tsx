import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { HairlineFigure } from "./HairlineFigure";

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
        <div className="container footer-inner">
          <p>Skills are sourced from public GitHub repositories and belong to their authors.</p>
          <div className="footer-signature">
            <HairlineFigure name="sheets" className="footer-sheets hairline-quiet-stage" label="Three folded skill sheets" />
            <a className="footer-credit" href="https://www.meedaydesign.xyz/" target="_blank" rel="noopener noreferrer">Built by Meeday</a>
          </div>
        </div>
      </footer>
    </>
  );
}
