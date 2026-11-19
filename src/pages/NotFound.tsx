import { useEffect } from "react";
import { Link } from "react-router-dom";

export function NotFound() {
  useEffect(() => {
    document.title = "Not found · Skill Bank";
  }, []);
  return (
    <div className="container empty page-empty">
      <h1>Skill not found</h1>
      <p>It may have been renamed or removed in the latest import.</p>
      <Link to="/" className="btn">
        Browse all skills
      </Link>
    </div>
  );
}
