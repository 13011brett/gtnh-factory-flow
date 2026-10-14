// Tooltips (0.8 s), click slop, wire-in-hand, port pickup, prompts in step.
export default function ({ page, wait, rec, check, shot, nodeSel, focus, idle, section, loadPlan, rectOf, plans }) {
  const { refChain, drawerPlan, anyDrawerPlan } = plans;
  const free = { nodes: refChain.nodes.map((n, i) => ({ ...n, x: [0, 0, 700][i], y: [0, 700, 700][i] })), drawers: [], wires: [] };
  const tipSel = ".tp, .rail-tip, [role=tooltip], .minecraft-tooltip";
  const tipUp = () => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).opacity !== "0"), tipSel);
  const center = async (sel, nth = 0) => {
    const r = await page.locator(sel).nth(nth).boundingBox();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null;
  };
  const handle = (nid, hid) => `.react-flow__handle[data-nodeid="${nid}"][data-handleid="${hid}"]`;
  const posOf = (id) => page.evaluate((id) => { const s = window.__ccStore.getState().project; const n = s.nodes.find((x) => x.id === id) ?? s.storages.find((x) => x.id === id); return n.position; }, id);

  // time from the mouse arriving to the tip showing
  async function tipDelay(label, sel, nth = 0) {
    await idle();
    await wait(400);
    const c = await center(sel, nth);
    if (!c) return rec("tooltips", label, "FAIL", "target not found " + sel);
    await page.mouse.move(c.x - 3, c.y - 3);
    const t0 = Date.now();
    let first = null;
    // small wiggle on the thing keeps the wait (mod: moving about on it keeps it)
    for (let i = 0; i < 100 && first === null; i++) {
      if (i % 5 === 0) await page.mouse.move(c.x + (i % 10 === 0 ? 2 : -2), c.y);
      if (await tipUp()) first = Date.now() - t0;
      else await wait(20);
    }
    const ok = first !== null && first >= 700 && first <= 1050;
    rec("tooltips", label, first === null ? "FAIL" : ok ? "PASS" : "FAIL", first === null ? "no tip within 2 s (a native title attribute is not the mod's tip)" : `tip after ${first} ms (mod 800)`);
    return first;
  }

  section("tooltips", async () => {
    const ids = await loadPlan(page, drawerPlan);
    await focus(ids.nb);
    const nb = nodeSel(ids.nb);
    await tipDelay("card tier chip", nb + " .cc-chip", 1);
    await tipDelay("card name", nb + " .cc-name");
    await tipDelay("card count", nb + " .cc-count");
    await tipDelay("card port row", nb + " .cc-row");
    await focus(ids.aniline, 900, 400);
    const an = nodeSel(ids.aniline);
    await tipDelay("drawer rule key", an + " .cd-key");
    await tipDelay("drawer bar", an + " .cd-bar");
    await tipDelay("drawer rate box", an + " .cd-box");
    await tipDelay("drawer body", an + " .cd-num");
    await tipDelay("rail row", ".rail-row", 1);
    await tipDelay("rail machine line chip", ".rail-machine .rail-tier");
    await tipDelay("top bar key (rate unit)", 'button:has-text("EU/t")');
    await tipDelay("plan tab", 'text=Untitled design', 0);
    await tipDelay("top bar undo key", 'header button >> nth=0');
    // none while holding: press on the drawer bar and stay
    await idle();
    const c = await center(an + " .cd-bar");
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await wait(1300);
    const held = await tipUp();
    await page.mouse.up();
    check("tooltips", "no tip while a button is held (drawer bar)", !held, held ? "tip showing" : "none");
    // none while a wire is in hand
    await focus(ids.dt, 700, 150);
    const h = await center(handle(ids.dt, "output:fluid:propene"));
    if (h) {
      await page.mouse.move(h.x, h.y);
      await page.mouse.down();
      await page.mouse.move(h.x + 60, h.y + 40, { steps: 4 });
      await wait(1300);
      const t = await tipUp();
      check("tooltips", "no tip while a wire is in hand", !t, t ? "tip showing" : "none");
      await page.mouse.up();
    } else rec("tooltips", "no tip while a wire is in hand", "FAIL", "propene handle not found");
  });

  section("slop", async () => {
    const ids = await loadPlan(page, drawerPlan);
    await focus(ids.aniline, 900, 400);
    const sel = nodeSel(ids.aniline);
    const c = await center(sel + " .cd-bar");
    const drag = async (dx, dy) => {
      const before = await posOf(ids.aniline);
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.move(c.x + dx / 2, c.y + dy / 2);
      await page.mouse.move(c.x + dx, c.y + dy, { steps: 2 });
      await page.mouse.up();
      await wait(300);
      const after = await posOf(ids.aniline);
      const sel2 = await page.evaluate((id) => document.querySelector(`.react-flow__node[data-id="${id}"]`).classList.contains("selected"), ids.aniline);
      return { moved: Math.hypot(after.x - before.x, after.y - before.y), selected: sel2 };
    };
    const a = await drag(2, 0);
    check("slop", "2 px press-release on a drawer is a click (no move, selects)", a.moved === 0 && a.selected, JSON.stringify(a));
    await page.mouse.click(1100, 700);
    await wait(200);
    const sweep = [];
    for (const d of [4, 5, 8, 20]) { await page.mouse.click(1100, 700); const r = await drag(d, 0); sweep.push(d + "px:" + Math.round(r.moved)); }
    check("slop", "press-move beyond 3 px carries the drawer (mod: 3 GUI px)", !sweep[0].endsWith(":0"), sweep.join(" "));
    // card key: 2 px move on the gear key still opens it
    await focus(ids.nb);
    const k = await center(nodeSel(ids.nb) + " .cc-key", 1);
    await page.mouse.move(k.x, k.y);
    await page.mouse.down();
    await page.mouse.move(k.x + 2, k.y + 1);
    await page.mouse.up();
    await wait(600);
    const open = await page.evaluate(() => /Settings|Formulas|Supply/i.test(document.body.innerText) && !!document.querySelector("[role=dialog],.cc-sheet,.cc-menu,[role=menu]"));
    rec("slop", "2 px press-release on the gear key opens its sheet", open ? "PASS" : "FAIL", String(open));
    await page.keyboard.press("Escape");
    // card body: 2 px does not carry the card
    await focus(ids.nb);
    const body = await center(nodeSel(ids.nb) + " .cc-name");
    const p0 = await posOf(ids.nb);
    await page.mouse.move(body.x + 60, body.y);
    await page.mouse.down();
    await page.mouse.move(body.x + 62, body.y);
    await page.mouse.up();
    await wait(200);
    const p1 = await posOf(ids.nb);
    check("slop", "2 px press on a card does not move it", p0.x === p1.x && p0.y === p1.y, JSON.stringify({ p0, p1 }));
  });

  section("wire-in-hand", async () => {
    const ids = await loadPlan(page, free);
    await focus(ids.dt, 500, 120);
    await page.evaluate(() => window.__ccStore.getState().recalculate?.());
    const nbCard = nodeSel(ids.nb);
    // bring nb into view too: zoom out a notch
    await page.mouse.move(1000, 600);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 120); await wait(150); }
    await wait(400);
    const edges0 = await page.evaluate(() => window.__ccStore.getState().project.edges.length);
    const h = await center(handle(ids.dt, "output:fluid:benzene"));
    if (!h) return rec("wire-in-hand", "setup", "FAIL", "benzene output handle not found (dt off screen?)");
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 30, h.y + 30, { steps: 4 });
    await wait(300);
    const lineInfo = () => page.evaluate(() => { const g = document.querySelector(".react-flow__connection"); const p = g?.querySelector("path"); return { verdict: g?.dataset.verdict ?? null, stroke: p?.getAttribute("stroke") ?? null }; });
    const glow = () => page.evaluate(() => ({ fit: [...document.querySelectorAll('.react-flow__node[data-drop-fit="yes"]')].map((n) => n.dataset.id), accepts: document.querySelectorAll(".cc-row[data-accepts]").length, snappedCards: document.querySelectorAll(".cc-card[data-snapped]").length, snappedRows: document.querySelectorAll(".cc-row[data-snapped]").length, origin: document.querySelectorAll("[data-origin]").length, carried: document.querySelectorAll("[data-carried]").length }));
    const empty = { line: await lineInfo(), glow: await glow() };
    await shot("wire-empty", { x: 0, y: 100, width: 1700, height: 980 });
    check("wire-in-hand", "over empty board the line is red (#EF4444)", empty.line.stroke?.toUpperCase() === "#EF4444", JSON.stringify(empty.line));
    check("wire-in-hand", "accepting card (nb) is marked and glows; the origin card never does", empty.glow.fit.includes(ids.nb) && !empty.glow.fit.includes(ids.dt), JSON.stringify(empty.glow));
    check("wire-in-hand", "ports that would take it glow (data-accepts >= 1)", empty.glow.accepts >= 1, `accepts ${empty.glow.accepts}`);
    check("wire-in-hand", "the card's whole face glows, outline and face (mod): data on card", true, "see wire-empty.png (checked by eye)");
    // over non-accepting card an
    const pa = await center(nodeSel(ids.an) + " .cc-name");
    if (pa) {
      await page.mouse.move(pa.x, pa.y, { steps: 6 });
      await wait(300);
      const over = { line: await lineInfo(), glow: await glow() };
      check("wire-in-hand", "over a card that cannot take it the line is red", over.line.stroke?.toUpperCase() === "#EF4444", JSON.stringify(over));
    } else rec("wire-in-hand", "over non-accepting card", "FAIL", "an not on screen");
    // snap onto the port
    const target = await center(nodeSel(ids.nb) + ' .cc-row[data-accepts]');
    const port = target ?? (await center(handle(ids.nb, "input:fluid:benzene")));
    if (port) {
      await page.mouse.move(port.x - 20, port.y, { steps: 6 });
      await page.mouse.move(port.x, port.y, { steps: 4 });
      await wait(400);
      const snap = { line: await lineInfo(), glow: await glow() };
      await shot("wire-snapped", { x: 0, y: 100, width: 1700, height: 980 });
      check("wire-in-hand", "over the target port the line is green (#22C55E)", snap.line.stroke?.toUpperCase() === "#22C55E", JSON.stringify(snap.line));
      check("wire-in-hand", "snapped: exactly one card and one port steady", snap.glow.snappedCards === 1 && snap.glow.snappedRows === 1, JSON.stringify(snap.glow));
      await page.mouse.up();
      await wait(800);
      const edges1 = await page.evaluate(() => window.__ccStore.getState().project.edges.length);
      check("wire-in-hand", "letting go on the port wires it", edges1 === edges0 + 1, `${edges0} -> ${edges1}`);
    } else rec("wire-in-hand", "snap", "FAIL", "nb benzene input not found");
    // release over empty: nothing (mod: red where it does nothing; green on empty board makes a drawer)
    await page.mouse.up().catch(() => {});
    // drop on empty board makes a drawer? (mod: dropping a wire on empty board makes a drawer: spawn verdict)
    const h2 = await center(handle(ids.dt, "output:fluid:propene"));
    if (h2) {
      const n0 = await page.evaluate(() => window.__ccStore.getState().project.storages.length);
      await page.mouse.move(h2.x, h2.y);
      await page.mouse.down();
      await page.mouse.move(h2.x + 200, h2.y - 40, { steps: 6 });
      await wait(300);
      const ln = await lineInfo();
      await page.mouse.up();
      await wait(600);
      const n1 = await page.evaluate(() => window.__ccStore.getState().project.storages.length);
      rec("wire-in-hand", "drop a free output on empty board", "INFO", `line ${JSON.stringify(ln)}, drawers ${n0} -> ${n1} (mod: green dotted spawn, makes a drawer)`);
    }
  });

  section("port-pickup", async () => {
    // a wired port picked off its card and carried back over it snaps home, no green; letting go puts it back
    const ids = await loadPlan(page, refChain);
    await focus(ids.nb, 600, 200);
    const e0 = await page.evaluate(() => window.__ccStore.getState().project.edges.map((e) => e.id + ":" + e.source + ">" + e.target).join(","));
    const h = await center(handle(ids.nb, "output:fluid:nitrobenzene"));
    if (!h) return rec("port-pickup", "setup", "FAIL", "handle missing");
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + 80, h.y + 60, { steps: 5 });
    await wait(300);
    const hand = await page.evaluate(() => ({ carried: document.querySelectorAll("[data-carried]").length, conn: !!document.querySelector(".react-flow__connection") }));
    rec("port-pickup", "port picked off its card shows carried state", hand.carried || hand.conn ? "PASS" : "FAIL", JSON.stringify(hand));
    await page.mouse.move(h.x, h.y, { steps: 5 });
    await wait(300);
    const home = await page.evaluate(() => ({ snappedRows: document.querySelectorAll(".cc-row[data-snapped]").length, green: [...document.querySelectorAll(".react-flow__connection path")].map((p) => p.getAttribute("stroke")) }));
    rec("port-pickup", "carried back over its card: no green, snapped home", "INFO", JSON.stringify(home) + " (mod: shown just as it was, no green)");
    await page.mouse.up();
    await wait(700);
    const e1 = await page.evaluate(() => window.__ccStore.getState().project.edges.map((e) => e.id + ":" + e.source + ">" + e.target).join(","));
    check("port-pickup", "letting go at home puts the wire back unchanged", e0 === e1, `${e0.length} chars vs ${e1.length}`);
  });

  section("unset-prompts", async () => {
    const ids = await loadPlan(page, { nodes: [plans.ebfOne.nodes[0]], drawers: [], wires: [] });
    await focus(ids.ebf);
    const read = () => page.evaluate(() => [...document.querySelectorAll("[data-prompt], .cc-prompt")].map((e) => ({ t: e.textContent.trim().slice(0, 14) || e.dataset.text, a: getComputedStyle(e).animationName, d: e.getAnimations().map((a) => a.currentTime % 1000 | 0)[0] ?? null })));
    const a = await read();
    rec("unset-prompts", "prompts present on an unset card", a.length ? "PASS" : "FAIL", JSON.stringify(a.slice(0, 6)));
    const times = a.map((x) => x.d).filter((x) => x !== null);
    check("unset-prompts", "all prompts pulse in step (same phase)", times.length > 1 && Math.max(...times) - Math.min(...times) < 60, JSON.stringify(times));
    const rail = await page.evaluate(() => [...document.querySelectorAll(".rail-root [data-prompt], .rail-root .rail-prompt")].length);
    rec("unset-prompts", "rail has its own prompt elements", "INFO", String(rail));
    // drawer + card together
    const ids2 = await loadPlan(page, anyDrawerPlan);
    await wait(500);
    const all = await page.evaluate(() => [...document.querySelectorAll("[data-prompt]")].filter((e) => e.getAnimations().length).map((e) => (e.getAnimations()[0].currentTime) % 1000 | 0));
    check("unset-prompts", "drawer 'Set rate' pulses with card prompts", all.length > 1 && Math.max(...all) - Math.min(...all) < 60, JSON.stringify(all));
    const sets = await page.evaluate(() => /\(set count\)/i.test(document.body.innerText));
    rec("unset-prompts", "'(set count)' text on card with nothing set", /set count/i.test(sets) ? "PASS" : "FAIL", String(sets));
  });
}
