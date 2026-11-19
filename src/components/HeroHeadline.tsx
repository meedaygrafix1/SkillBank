import { useEffect, useState } from "react";
import Bot from "kubai-icons-react/icons/bot";
import Sparkles from "kubai-icons-react/icons/sparkles";

export function HeroHeadline() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  const trigger = reducedMotion ? "none" : "parent";

  return (
    <h1 aria-label="Make your agent more capable.">
      <span className="hero-headline-line">Make your</span>
      <span className="hero-headline-line">
        <span className="hero-keyword" data-kubai-trigger>
          <Bot className="hero-word-icon" size="0.78em" color="var(--accent)" trigger={trigger} />
          agent
        </span>
        {" "}more
      </span>
      <span className="hero-headline-line">
        <span className="hero-keyword" data-kubai-trigger>
          capable.
          <Sparkles className="hero-word-icon" size="0.78em" color="var(--accent)" trigger={trigger} />
        </span>
      </span>
    </h1>
  );
}
