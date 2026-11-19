/** Three stepped filing drawers: the chosen drawer opens and its neighbours peek out in turn. */
const {
  Cam, clamp, disposer, facing, fillet, fit, hull, mk, open, pointer, poly,
  prism, proj, put, register, ringAt, rings, rrect, run, seg, solid,
  tdone, tset, tval, tween,
} = HL;

const REST = [5, 13, 7], BASE = [5, 39, 73], FRONT = 56;
const widths = [[0, 112], [8, 104], [16, 96]];

function mount({ stage, svg, read }, value) {
  const bag = disposer(), C = Cam(45, 0.5, 1.65);
  let reach = value, active = -1;
  const corners = widths.flatMap(([x0, x1], i) =>
    [x0 - 3, x1 + 3].flatMap((x) => [0, FRONT + 48].flatMap((y) =>
      [BASE[i] - 4, BASE[i] + 34].map((z) => [x, y, z]))));
  fit(C, corners, 200, 166);
  const P = proj(C), front = facing(C), root = mk("g", {}, svg);
  const drawers = [];
  const [foot, footInner] = rings(-4, -4, 116, 60, 5, 1.5);
  put(solid(root), prism(P, front, foot, footInner, 0, 5));

  widths.forEach(([x0, x1], i) => {
    const z = BASE[i], [outer, inner] = rings(x0, 0, x1, FRONT, 4.5, 1.6);
    put(solid(root), prism(P, front, outer, inner, z, z + 31));
    const group = mk("g", {}, root);
    const body = solid(group);
    const cavity = mk("path", { class: "lo" }, group);
    const floor = mk("path", { class: "nf lo" }, group);
    const divider = mk("path", { class: "sil" }, group);
    const panel = mk("path", { class: "sil" }, group);
    const rim = mk("path", { class: "nf lo" }, group);
    const pull = mk("path", { class: "nf" }, group);
    const inset = mk("path", { class: "nf lo" }, group);
    const tab = mk("path", { class: "nf lo" }, group);
    drawers.push({ i, x0, x1, z, body, cavity, floor, divider, panel, rim, pull, inset, tab,
      extension: tween(REST[i]), drawn: null });
  });

  function draw(drawer, extension) {
    if (drawer.drawn !== null && Math.abs(drawer.drawn - extension) < 0.0001) return;
    drawer.drawn = extension;
    const { x0, x1, z } = drawer;
    const left = x0 + 3, right = x1 - 3, end = FRONT + extension, centre = (left + right) / 2;
    const [outer, inner] = rings(left, FRONT - 1, right, end, 2, 1);
    put(drawer.body, prism(P, front, outer, inner, z + 3, z + 26));
    const cavityRing = rrect(left + 2, FRONT + 1, right - 2, end - 2, 1, 5);
    drawer.cavity.setAttribute("d", poly(ringAt(P, cavityRing, z + 25)));
    drawer.floor.setAttribute("d", open(ringAt(P, run(cavityRing, (q) => !front(q)), z + 9)));
    const cardY = FRONT + extension * 0.5;
    const card = fillet([[left + 5, z + 12], [right - 5, z + 12], [right - 5, z + 27],
      [centre + 9, z + 27], [centre + 9, z + 31], [centre - 8, z + 31],
      [centre - 8, z + 27], [left + 5, z + 27]], [1, 1, 2, 1, 1.5, 1.5, 1, 2]);
    drawer.divider.setAttribute("d", poly(card.map(([x, h]) => P(x, cardY, h))));
    const face = rrect(left - 1, z + 2, right + 1, z + 28, 3, 6);
    const onFace = (ring) => ring.map((q) => P(q.u, end + 0.4, q.v));
    drawer.panel.setAttribute("d", poly(onFace(face)));
    drawer.rim.setAttribute("d", seg(P(left + 3, end + 0.4, z + 25), P(right - 3, end + 0.4, z + 25)));
    drawer.pull.setAttribute("d", poly(onFace(rrect(centre - 12, z + 11, centre + 12, z + 17, 2.7, 6))));
    drawer.inset.setAttribute("d", poly(onFace(rrect(centre - 9.5, z + 12.5, centre + 9.5, z + 15.6, 1.4, 5))));
    drawer.tab.setAttribute("d", poly(onFace(rrect(centre - 6, z + 20, centre + 6, z + 23, 0.9, 5))));
  }

  // Each hit band is fixed on its drawer's resting front plane, never on the moving face.
  const bands = drawers.map(({ x0, x1, z }, i) => {
    const o = P(0, FRONT + REST[i], 0), x = P(1, FRONT + REST[i], 0), h = P(0, FRONT + REST[i], 1);
    return { o, ex: [x[0] - o[0], x[1] - o[1]], ez: [h[0] - o[0], h[1] - o[1]],
      x0, x1, z, centre: (x0 + x1) / 2 };
  });
  function hit([sx, sy]) {
    let chosen = -1, nearest = Infinity;
    bands.forEach(({ o, ex, ez, x0, x1, z, centre }, i) => {
      const dx = sx - o[0], dy = sy - o[1], det = ex[0] * ez[1] - ex[1] * ez[0];
      const x = (dx * ez[1] - dy * ez[0]) / det, height = (ex[0] * dy - ex[1] * dx) / det;
      if (x < x0 - 8 || x > x1 + 8 || height < z - 7 || height > z + 38) return;
      const distance = Math.hypot((x - centre) / ((x1 - x0) / 2), (height - z - 15) / 18);
      if (distance < nearest) { nearest = distance; chosen = i; }
    });
    return chosen;
  }

  drawers.forEach((drawer, i) => {
    draw(drawer, REST[i]);
    drawer.panel.classList.toggle("hi", i === 1);
  });
  read.textContent = "rest";
  const loop = register(stage, (_dt, now) => {
    let moving = false;
    drawers.forEach((drawer) => {
      draw(drawer, tval(drawer.extension, now));
      if (!tdone(drawer.extension, now)) moving = true;
    });
    return moving;
  });
  bag.add(loop.unregister);

  function targets(previous = active) {
    const now = performance.now(), origin = active < 0 ? previous : active;
    drawers.forEach((drawer, i) => {
      const distance = Math.abs(i - origin);
      const next = active < 0 ? REST[i] : i === active ? reach : REST[i] + reach * 0.16 / (distance + 1);
      tset(drawer.extension, clamp(next, 3, 48), now, distance * 40);
      drawer.panel.classList.toggle("hi", active < 0 ? i === 1 : i === active);
    });
    read.textContent = active < 0 ? "rest" : `drawer ${String(3 - active).padStart(2, "0")}`;
    loop.wake();
  }
  function choose(next) {
    if (next === active) return;
    const previous = active;
    active = next;
    targets(previous);
  }
  bag.add(pointer(stage, { move: (point) => choose(hit(point)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());
  return { set: (next) => { reach = next; targets(); }, destroy: bag.dispose };
}

hairline({
  name: "archive",
  means: "A stepped archive: the drawer under your pointer opens, and neighbouring drawers follow with a smaller reach.",
  rules: [1, 2, 4, 5, 8, 9],
  range: [20, 34, 48],
  tour: [[192, 103], [186, 157], [190, 212], null],
  mount,
});
