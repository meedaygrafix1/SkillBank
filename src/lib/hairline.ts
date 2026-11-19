type FigureHandle = { set(value: number): void; destroy(): void };
export type HairlineName = "archive" | "sheets" | "empty-tray";
type Figure = {
  range: [number, number, number];
  mount(host: { stage: HTMLElement; svg: SVGSVGElement; read: { textContent: string | null } }, value: number): FigureHandle;
};
type Engine = {
  inject(root: Document): void;
  mk(tag: string, attributes: Record<string, string>, parent: Element): SVGSVGElement;
};
type Runtime = Window & { HL?: Engine; hairline?: (figure: Figure) => void };

const definitions = new Map<HairlineName, Promise<Figure>>();
let queue = Promise.resolve();
let engineReady: Promise<Engine> | undefined;

function script(src: string, module = false) {
  return new Promise<void>((resolve, reject) => {
    const element = document.createElement("script");
    if (module) element.type = "module";
    element.src = src;
    element.onload = () => resolve();
    element.onerror = () => { element.remove(); reject(new Error("Illustration could not load")); };
    document.head.append(element);
  });
}

export function loadHairline(name: HairlineName) {
  const runtime = window as Runtime;
  const base = `${import.meta.env.BASE_URL}hairline/`;
  if (!engineReady) {
    engineReady = (async () => {
      if (!runtime.HL) await script(`${base}kernel.js`);
      const engine = runtime.HL!;
      engine.inject(document);
      return engine;
    })().catch((error) => { engineReady = undefined; throw error; });
  }
  const readyEngine = engineReady;
  let definition = definitions.get(name);
  if (!definition) {
    // All modules call one global registrar, so capture their definitions in order.
    definition = queue.then(async () => {
      await readyEngine;
      let captured: Figure | undefined;
      const previous = runtime.hairline;
      runtime.hairline = (figure) => { captured = figure; };
      try {
        await script(`${base}${name}.js`, true);
        if (!captured) throw new Error("Illustration did not register");
        return captured;
      } finally {
        runtime.hairline = previous;
      }
    });
    definitions.set(name, definition);
    queue = definition.then(() => {}, () => { definitions.delete(name); });
  }
  return Promise.all([definition, readyEngine]).then(([figure, engine]) => ({ figure, engine }));
}
