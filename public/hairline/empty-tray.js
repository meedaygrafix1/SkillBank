/** An empty document tray on runners; pulling it out reveals its bare floor. */
const {
  Cam, clamp, disposer, facing, fit, hull, mk, open, pointer, poly, prism,
  proj, put, register, ringAt, rings, rrect, run, solid,
  tdone, tset, tval, tween, unproj,
} = HL;

function mount({ stage, svg, read }, value) {
  const bag = disposer(), C = Cam(45, 0.5, 1.95);
  let reach = value, active = false, drawn = null;
  const slide = tween(12);
  fit(C, [[-8, -10, 0], [108, -10, 0], [-8, 84, 0], [108, 84, 0],
    [4, 130, 7], [96, 130, 25], [4, 6, 25], [96, 6, 25]], 200, 166);
  const P = proj(C), front = facing(C), root = mk("g", {}, svg);
  const [base, baseInner] = rings(-8, -10, 108, 84, 6, 2);
  put(solid(root), prism(P, front, base, baseInner, 0, 5));
  // Runners sit behind the sliding tray, never across the empty cavity.
  for (const x of [-5, 100]) {
    const [rail, railInner] = rings(x, -4, x + 5, 79, 2, 0.8);
    put(solid(root), prism(P, front, rail, railInner, 5, 12));
  }
  const tray = mk("g", {}, root);
  const shell = mk("path", { class: "sil" }, tray);
  const floor = mk("path", { class: "lo" }, tray);
  const innerRim = mk("path", { class: "nf lo" }, tray);
  const floorSeam = mk("path", { class: "nf lo" }, tray);
  const nearWall = mk("path", { class: "fo" }, tray);
  const outerRim = mk("path", { class: "nf lo" }, tray);
  const innerEdge = mk("path", { class: "nf" }, tray);
  const silhouette = mk("path", { class: "nf sil hi" }, tray);
  const pull = mk("path", { class: "nf lo" }, tray);
  const leftToRight = (points) => points[0][0] < points[points.length - 1][0] ? points : points.slice().reverse();

  function draw(extension) {
    if (drawn !== null && Math.abs(drawn - extension) < 0.0001) return;
    drawn = extension;
    const y0 = 6 + extension, y1 = 74 + extension;
    const outer = rrect(4, y0, 96, y1, 5, 6), inner = rrect(7, y0 + 3, 93, y1 - 3, 2, 6);
    shell.setAttribute("d", poly(hull(ringAt(P, outer, 7).concat(ringAt(P, outer, 25)))));
    floor.setAttribute("d", poly(ringAt(P, inner, 10)));
    innerRim.setAttribute("d", poly(ringAt(P, inner, 25)));
    floorSeam.setAttribute("d", open(ringAt(P, run(inner, (q) => !front(q)), 10)));
    const inside = leftToRight(ringAt(P, run(inner, front), 25));
    const top = leftToRight(ringAt(P, run(outer, front), 25));
    const bottom = leftToRight(ringAt(P, run(outer, front), 7));
    nearWall.setAttribute("d", poly([...inside, top[top.length - 1], ...bottom.slice().reverse(), top[0]]));
    outerRim.setAttribute("d", open(top));
    innerEdge.setAttribute("d", open(inside));
    silhouette.setAttribute("d", open([top[0], ...bottom, top[top.length - 1]]));
    pull.setAttribute("d", poly(rrect(37, 12, 63, 18, 2.5, 6).map((q) => P(q.u, y1 + 0.2, q.v))));
  }
  const loop = register(stage, (_dt, now) => {
    draw(tval(slide, now));
    return !tdone(slide, now);
  });
  bag.add(loop.unregister);
  read.textContent = "rest";
  function targets() {
    tset(slide, active ? clamp(reach, 32, 56) : 12, performance.now(), 0);
    read.textContent = active ? "tray · 0" : "rest";
    loop.wake();
  }
  function choose(next) {
    if (next === active) return;
    active = next;
    targets();
  }
  bag.add(pointer(stage, {
    move: ([sx, sy]) => {
      const [x, y] = unproj(C, sx, sy, 15);
      choose(x >= -12 && x <= 112 && y >= 0 && y <= 142);
    },
    leave: () => choose(false),
  }));
  bag.add(() => svg.replaceChildren());
  return { set: (next) => { reach = next; targets(); }, destroy: bag.dispose };
}

hairline({
  name: "empty-tray",
  means: "An empty skill tray on runners: the pointer pulls it open to reveal the bare floor.",
  rules: [1, 3, 4, 5, 6, 7, 8, 9, 10],
  range: [32, 44, 56],
  tour: [[227, 152], [169, 201], null],
  mount,
});
