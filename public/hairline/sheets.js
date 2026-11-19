/** The folded skill document, rebuilt as three thin sheets with a lifting top page. */
const {
  Cam, clamp, disposer, fillet, fit, mk, open, pointer, poly, proj, rad,
  register, tdone, tset, tval, tween, unproj,
} = HL;

const W = 68, H = 88, FOLD = 23, REST = [0, 2, 7];

function mount({ stage, svg, read }, value) {
  const bag = disposer(), C = Cam(45, 0.5, 2.7);
  let reach = value, active = false;
  const world = (i, x, y, angle, lift, thickness = 0) => [
    x + i * 4, y * Math.cos(rad(angle)) + i * 5,
    i * 3 + lift + y * Math.sin(rad(angle)) - thickness,
  ];
  const bounds = [];
  for (const angle of [0, 28]) for (const x of [0, W]) for (const y of [0, H]) {
    bounds.push(world(2, x, y, angle, angle ? 12 : 2));
    bounds.push(world(0, x, y, 0, 0, 1.2));
  }
  fit(C, bounds, 200, 166);
  const P = proj(C), root = mk("g", {}, svg);
  const outline = fillet([[0, 0], [W - FOLD, 0], [W, FOLD], [W, H], [0, H]], [3, 1, 1, 3, 3]);
  const fold = fillet([[W - FOLD, 0], [W - FOLD, FOLD], [W, FOLD]], [0.8, 1.5, 0.8]);
  const sheets = REST.map((angle, i) => {
    const group = mk("g", {}, root);
    return {
      i, back: mk("path", { class: "lo" }, group), face: mk("path", { class: i === 2 ? "sil hi" : "sil" }, group),
      fold: mk("path", { class: "nf lo" }, group),
      angle: tween(angle), lift: tween(i === 2 ? 2 : 0), last: null,
    };
  });

  function draw(sheet, angle, lift) {
    if (sheet.last && Math.abs(sheet.last[0] - angle) < 0.0001 && Math.abs(sheet.last[1] - lift) < 0.0001) return;
    sheet.last = [angle, lift];
    const onPage = (point, thickness = 0) => P(...world(sheet.i, point[0], point[1], angle, lift, thickness));
    sheet.back.setAttribute("d", poly(outline.map((p) => onPage(p, 1.2))));
    sheet.face.setAttribute("d", poly(outline.map((p) => onPage(p))));
    sheet.fold.setAttribute("d", open(fold.map((p) => onPage(p))));
  }
  const loop = register(stage, (_dt, now) => {
    let moving = false;
    sheets.forEach((sheet) => {
      draw(sheet, tval(sheet.angle, now), tval(sheet.lift, now));
      if (!tdone(sheet.angle, now) || !tdone(sheet.lift, now)) moving = true;
    });
    return moving;
  });
  bag.add(loop.unregister);
  read.textContent = "rest";

  function targets() {
    const now = performance.now();
    sheets.forEach((sheet, i) => {
      const delay = Math.abs(2 - i) * 40;
      tset(sheet.angle, active ? [3, 10, clamp(reach, 16, 28)][i] : REST[i], now, delay);
      tset(sheet.lift, active ? [0, 4, 12][i] : i === 2 ? 2 : 0, now, delay);
    });
    read.textContent = active ? "sheet 03" : "rest";
    loop.wake();
  }
  function choose(next) {
    if (next === active) return;
    active = next;
    targets();
  }
  bag.add(pointer(stage, {
    move: ([sx, sy]) => {
      const [x, y] = unproj(C, sx, sy, 10);
      choose(x >= -10 && x <= W + 20 && y >= -10 && y <= H + 24);
    },
    leave: () => choose(false),
  }));
  bag.add(() => svg.replaceChildren());
  return { set: (next) => { reach = next; targets(); }, destroy: bag.dispose };
}

hairline({
  name: "sheets",
  means: "Three folded skill sheets: the top page lifts and the two beneath it part gently in turn.",
  rules: [1, 2, 4, 5, 7, 8, 10],
  range: [16, 22, 28],
  tour: [[204, 180], [167, 210], null],
  mount,
});
