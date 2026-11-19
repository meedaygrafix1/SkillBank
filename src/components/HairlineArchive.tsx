import { useEffect, useRef, useState } from "react";

type Stop = [number, number] | null;
type FigureHandle = { set(value: number): void; destroy(): void };
type Figure = {
  means: string;
  range: [number, number, number];
  tour: Stop[];
  mount(host: { stage: HTMLElement; svg: SVGSVGElement; read: { textContent: string | null } }, value: number): FigureHandle;
};
type Engine = {
  inject(root: Document): void;
  mk(tag: string, attributes: Record<string, string>, parent: Element): SVGSVGElement;
  tour(stage: HTMLElement, stops: Stop[], onStop: (index: number) => void): { stop(): void };
};
type Runtime = Window & { HL: Engine; hairline: (figure: Figure) => void };

let definition: Promise<Figure> | undefined;
let stylesInjected = false;

function script(src: string, module = false) {
  return new Promise<void>((resolve, reject) => {
    const element = document.createElement("script");
    if (module) element.type = "module";
    element.src = src;
    element.onload = () => resolve();
    element.onerror = () => { element.remove(); reject(new Error("Archive could not load")); };
    document.head.append(element);
  });
}

function loadArchive() {
  if (!definition) {
    definition = (async () => {
      const runtime = window as unknown as Runtime;
      const base = `${import.meta.env.BASE_URL}hairline/`;
      if (!runtime.HL) await script(`${base}kernel.js`);
      let capture!: (figure: Figure) => void;
      const ready = new Promise<Figure>((resolve) => { capture = resolve; });
      runtime.hairline = capture;
      await script(`${base}archive.js`, true);
      return ready;
    })().catch((error) => { definition = undefined; throw error; });
  }
  return definition;
}

export function HairlineArchive() {
  const stageRef = useRef<HTMLDivElement>(null);
  const readRef = useRef<HTMLOutputElement>(null);
  const tourRef = useRef<{ stop(): void } | null>(null);
  const figureRef = useRef<Figure | null>(null);
  const stepRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      tourRef.current?.stop();
      tourRef.current = null;
      stepRef.current = 0;
      setPlaying(false);
      setReducedMotion(query.matches);
      stageRef.current?.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    let disposed = false;
    let handle: FigureHandle | undefined;
    const stage = stageRef.current!;
    loadArchive().then((figure) => {
      if (disposed) return;
      const engine = (window as unknown as Runtime).HL;
      if (!stylesInjected) { engine.inject(document); stylesInjected = true; }
      stage.dataset.hairline = "archive";
      const svg = engine.mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, stage);
      let text: string | null = "rest";
      const read = {
        get textContent() { return text; },
        set textContent(value: string | null) {
          text = value;
          if (readRef.current) readRef.current.textContent = value;
        },
      };
      handle = figure.mount({ stage, svg, read }, figure.range[1]);
      figureRef.current = figure;
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      tourRef.current?.stop();
      tourRef.current = null;
      handle?.destroy();
      stage.replaceChildren();
      figureRef.current = null;
    };
  }, []);

  function toggleTour() {
    if (!stageRef.current || !figureRef.current) return;
    if (reducedMotion) {
      const stage = stageRef.current;
      const stops = figureRef.current.tour;
      const point = stops[stepRef.current++ % stops.length];
      if (point) {
        const bounds = stage.getBoundingClientRect();
        stage.dispatchEvent(new PointerEvent("pointermove", {
          pointerType: "mouse", pointerId: 1, bubbles: true,
          clientX: bounds.left + bounds.width * point[0] / 400,
          clientY: bounds.top + bounds.height * point[1] / 320,
        }));
      } else stage.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
      return;
    }
    if (tourRef.current) {
      tourRef.current.stop();
      tourRef.current = null;
      setPlaying(false);
    } else {
      tourRef.current = (window as unknown as Runtime).HL.tour(stageRef.current, figureRef.current.tour, () => {});
      setPlaying(true);
    }
  }

  return (
    <figure className="archive-figure">
      <div className="archive-topline">
        <span>01 / The archive</span>
        <output ref={readRef} aria-live="polite">rest</output>
      </div>
      <div
        ref={stageRef}
        className="archive-stage"
        role="img"
        aria-label={`An interactive stepped archive cabinet. ${reducedMotion ? "Use Next drawer to step through the archive." : "Move across the drawers to open them, or use Play tour."}`}
        aria-busy={!ready && !failed}
      />
      {failed && <p className="archive-error">The archive preview couldn’t load.</p>}
      <figcaption className="archive-caption">
        <span>{reducedMotion ? "Step through the drawers" : "Move across the drawers"}</span>
        <button type="button" className="archive-play" aria-label={reducedMotion ? "Show next archive drawer" : undefined} aria-pressed={reducedMotion ? undefined : playing} onClick={toggleTour} disabled={!ready}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            {reducedMotion ? <path d="M3 5h10l-5 6z" fill="currentColor" /> : playing ? <path d="M4 3h3v10H4zm5 0h3v10H9z" fill="currentColor" /> : <path d="m5 3 8 5-8 5z" fill="currentColor" />}
          </svg>
          {reducedMotion ? "Next drawer" : playing ? "Stop tour" : "Play tour"}
        </button>
      </figcaption>
    </figure>
  );
}
