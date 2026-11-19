import { useEffect, useRef, useState } from "react";
import { loadHairline, type HairlineName } from "../lib/hairline";

export function HairlineFigure({ name, label, className, errorMessage }: {
  name: HairlineName;
  label: string;
  className: string;
  errorMessage?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;
    const stage = stageRef.current!;
    loadHairline(name).then(({ figure, engine }) => {
      if (disposed) return;
      stage.dataset.hairline = name;
      const svg = engine.mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, stage);
      let text: string | null = "rest";
      const read = {
        get textContent() { return text; },
        set textContent(value: string | null) {
          text = value;
          stage.dataset.state = value ?? "rest";
        },
      };
      const handle = figure.mount({ stage, svg, read }, figure.range[1]);
      destroy = handle.destroy;
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      destroy?.();
      stage.replaceChildren();
    };
  }, [name]);

  return (
    <>
      <div ref={stageRef} className={`hairline-stage ${className}`} role="img" aria-label={label} aria-busy={!ready && !failed} />
      {failed && errorMessage && <p className="archive-error">{errorMessage}</p>}
    </>
  );
}
