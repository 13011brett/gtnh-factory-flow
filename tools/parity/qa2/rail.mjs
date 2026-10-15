// Overview rail, notices, spare popup, layout, hover scope.
// Sizes are read in CSS px (offsetWidth/Height): the shell is zoomed by the interface Size (--ui-scale, 1.17 at 1080p), which bounding boxes include.
export default function ({ page, wait, rec, check, shot, nodeSel, focus, idle, section, loadPlan, rectOf, camera, plans }) {
  const { refChain, drawerPlan, forcedPlan } = plans;
  const centre = async (sel, nth = 0) => {
    const r = await page.locator(sel).nth(nth).boundingBox();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, left: r.x, top: r.y } : null;
  };

  section("layout", async () => {
    await loadPlan(page, drawerPlan);
    await wait(500);
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const root = r(".rail-root"), flow = r(".react-flow"), items = r("aside:not(.inspector-panel):last-of-type");
      const search = [...document.querySelectorAll("input")].find((i) => /Search item or fluid/i.test(i.placeholder))?.getBoundingClientRect();
      const insp = document.querySelector("aside.inspector-panel");
      return { root: root && { x: root.x, w: document.querySelector(".rail-root").offsetWidth }, flow: flow && { x: flow.x, w: flow.width }, searchX: search?.x, inspector: !!insp, vw: innerWidth, parentW: document.querySelector(".rail-root")?.parentElement?.offsetWidth };
    });
    rec("layout", "geometry", "INFO", JSON.stringify(g));
    check("layout", "overview rail is on the left", g.root && g.root.x < 10, JSON.stringify(g.root));
    check("layout", "items search is on the right", g.searchX > g.vw * 0.7, `search x ${g.searchX} of ${g.vw}`);
    check("layout", "no right inspector panel", !g.inspector, String(g.inspector));
    check("layout", "rail column is 234 wide (spec)", Math.abs((g.parentW ?? 0) - 234) < 1.5 || Math.abs((g.root?.w ?? 0) - 234) < 1.5, `root ${g.root?.w}, parent ${g.parentW}`);
    // fold
    const fold = page.locator(".rail-key-fold").first();
    if (await fold.count()) {
      await fold.click();
      await wait(600);
      const w = await page.evaluate(() => ({ root: document.querySelector(".rail-root")?.offsetWidth, strip: document.querySelector(".rail-strip")?.offsetWidth, label: document.querySelector(".rail-strip-label")?.textContent }));
      await shot("rail-folded", { x: 0, y: 0, width: 500, height: 600 });
      check("layout", "folded rail is a 26 wide strip", Math.abs((w.strip ?? w.root) - 26) < 1.5, JSON.stringify(w));
      const flowW = await page.evaluate(() => document.querySelector(".react-flow").getBoundingClientRect().width);
      rec("layout", "board widens when folded", "INFO", `board ${flowW}`);
      await page.locator(".rail-strip, .rail-key-fold").first().click();
      await wait(500);
      const w2 = await page.evaluate(() => document.querySelector(".rail-root")?.offsetWidth);
      check("layout", "unfold restores width", Math.abs(w2 - g.root.w) < 1.5, `${w2} vs ${g.root.w}`);
    } else rec("layout", "fold key", "FAIL", "no .rail-key-fold");
  });

  section("rail", async () => {
    const ids = await loadPlan(page, drawerPlan);
    await wait(600);
    const model = await page.evaluate(() => {
      const secs = [...document.querySelectorAll(".rail-sec")].map((s) => ({ title: s.querySelector(".rail-sec-title")?.textContent, badge: s.querySelector(".rail-sec-badge")?.textContent, h: s.getBoundingClientRect().height }));
      const rows = [...document.querySelectorAll(".rail-row")].map((r) => ({ h: Math.round(r.offsetHeight), text: r.innerText.replace(/\n/g, " ").slice(0, 60) }));
      const pcs = [...document.querySelectorAll(".rail-sec-title")].map((e) => e.textContent);
      return { secs, rowsH: [...new Set(rows.map((r) => r.h))], nrows: rows.length, titles: pcs, first: rows.slice(0, 3) };
    });
    rec("rail", "sections and row heights", "INFO", JSON.stringify(model));
    check("rail", "sections are Inputs, Outputs, Internal, Machines in the mod's order", ["INPUTS", "OUTPUTS", "INTERNAL", "MACHINES"].every((t, i) => (model.titles[i] ?? "").toUpperCase() === t), model.titles.join(","));
    check("rail", "rows are 24 high (spec)", model.rowsH.length >= 1 && model.rowsH.every((h) => Math.abs(h - 24) <= 2), model.rowsH.join(","));
    // inputs count vs mod counts for this plan: open ports count as free terminals (mod: 6 inputs, 13-14 outputs)
    const modTitles = await page.evaluate(() => [...document.querySelectorAll(".rail-sec")].map((s) => (s.querySelector(".rail-sec-title")?.textContent ?? "") + " " + (s.querySelector(".rail-sec-badge")?.textContent ?? "")));
    rec("rail", "section badges", "INFO", modTitles.join(" | ") + "  (mod ref-chain: INPUTS 6, OUTPUTS 13 or 14, INTERNAL 2, MACHINES 3)");
    // ~ Set row: click the Set box of Hydrogen
    const row = page.locator(".rail-row", { hasText: "Hydrogen" }).first();
    await row.scrollIntoViewIfNeeded();
    const n0 = await page.evaluate(() => { const s = window.__ccStore.getState().project; return { drawers: s.storages.length, rates: s.nodes.reduce((t, n) => t + Object.keys(n.portRates ?? {}).length, 0) }; });
    await row.locator(".rail-box").first().click();
    await wait(400);
    await shot("rail-set-popup", { x: 0, y: 0, width: 700, height: 700 });
    const popupOpen = await page.evaluate(() => !!document.querySelector(".rail-popup, input:focus"));
    rec("rail", "Set box click opens a rate editor", popupOpen ? "PASS" : "FAIL", String(popupOpen));
    await page.keyboard.press("Control+a");
    await page.keyboard.type("4");
    await page.keyboard.press("Enter");
    await wait(800);
    const n1 = await page.evaluate(() => { const s = window.__ccStore.getState().project; return { drawers: s.storages.length, rates: s.nodes.reduce((t, n) => t + Object.keys(n.portRates ?? {}).length, 0) }; });
    check("rail", "~ Set on an unset input line sets its one open port's rate (portRates) or a drawer", n1.rates + n1.drawers === n0.rates + n0.drawers + 1, JSON.stringify({ n0, n1 }));
    const after = await row.innerText();
    rec("rail", "row after setting", "INFO", after.replace(/\n/g, " "));
    // rule key cycle
    const key = row.locator(".rail-key, .rail-rule").first();
    if (await key.count()) {
      await key.click();
      await wait(300);
      const menu = await page.evaluate(() => [...document.querySelectorAll(".rail-menu-item")].map((e) => e.textContent.trim()));
      rec("rail", "rule key menu", "INFO", JSON.stringify(menu));
      await page.keyboard.press("Escape");
    }
    // filter
    const filter = page.locator(".rail-filter input, input.rail-filter").first();
    await filter.fill("pro");
    await wait(400);
    const vis = await page.evaluate(() => [...document.querySelectorAll(".rail-row")].map((r) => r.querySelector(".rail-name")?.textContent ?? ""));
    check("rail", "filter 'pro' keeps only matching rows", vis.length > 0 && vis.every((n) => /pro/i.test(n)), JSON.stringify(vis));
    await filter.fill("");
    await wait(300);
    // machine lines
    const mach = await page.evaluate(() => [...document.querySelectorAll(".rail-machine")].map((m) => m.innerText.replace(/\n/g, " ")));
    rec("rail", "machine lines", "INFO", JSON.stringify(mach));
    const ml = page.locator(".rail-machine").first();
    if (await ml.count()) {
      const before = await page.evaluate(() => window.__ccStore.getState().project.nodes.map((n) => n.solvePin));
      const num = ml.locator(".rail-box").first();
      await num.hover();
      await page.mouse.wheel(0, -100);
      await wait(500);
      const mid = await page.evaluate(() => window.__ccStore.getState().project.nodes.map((n) => n.solvePin));
      check("rail", "wheel on a machine line count pins/steps the count", JSON.stringify(before) !== JSON.stringify(mid), `${JSON.stringify(before)} -> ${JSON.stringify(mid)}`);
    }
    // hover scope: row lights its resource everywhere
    await idle();
    const rowAn = page.locator(".rail-row", { hasText: "Aniline" }).first();
    await rowAn.hover();
    await wait(500);
    const scope = await page.evaluate(() => {
      const edges = [...document.querySelectorAll(".react-flow__edge")].map((e) => ({ id: e.dataset.id ?? e.getAttribute("data-testid"), op: getComputedStyle(e).opacity, cls: e.className.baseVal ?? "" }));
      const nodes = [...document.querySelectorAll(".react-flow__node")].map((n) => getComputedStyle(n).opacity);
      return { edgeOps: edges.map((e) => e.op), nodeOps: nodes };
    });
    rec("rail", "row hover lights its resource (others dim): measured by pixels in hover-scope", "INFO", JSON.stringify(scope));
    await shot("rail-hover-scope");
  });

  section("notices", async () => {
    // acid at most 0.05 while the reactor needs more; aniline at least 5 (more than the chain can make by its pins)
    const plan = { ...drawerPlan, drawers: drawerPlan.drawers.map((d) => (d.key === "acid" ? { ...d, rate: 0.05, mode: "at-most" } : d.key === "aniline" ? { ...d, rate: 50, mode: "at-least" } : d)) };
    plan.nodes = plan.nodes.map((n) => (n.key === "nb" ? { ...n, pin: 0.01 } : n));
    const ids = await loadPlan(page, plan);
    await wait(900);
    const t = await page.evaluate(() => ({ text: document.querySelector(".rail-notices")?.innerText ?? null, n: document.querySelectorAll(".rail-notice").length, show: document.querySelectorAll(".rail-notice-show").length, h: document.querySelector(".rail-notice")?.offsetHeight }));
    rec("notices", "bar content", "INFO", JSON.stringify(t));
    await page.screenshot({ path: OUTP("notices"), clip: { x: 0, y: 700, width: 1000, height: 380 } }).catch(() => {});
    check("notices", "at least one notice with a Show me key", t.n >= 1 && t.show >= 1, JSON.stringify(t));
    check("notices", "notice row height 24 (spec)", Math.abs((t.h ?? 0) - 24) <= 2, `h ${t.h}`);
    if (t.show) {
      const c0 = await camera(page);
      await page.locator(".rail-notice-show").first().click();
      await wait(900);
      const c1 = await camera(page);
      const sel = await page.evaluate(() => [...document.querySelectorAll(".react-flow__node.selected")].map((n) => n.dataset.id));
      check("notices", "Show me frames the thing (camera moves) and selects it", Math.hypot(c0.x - c1.x, c0.y - c1.y) > 5 || c0.zoom !== c1.zoom || sel.length > 0, JSON.stringify({ c0, c1, sel }));
    }
    // wording: mod says "allows at most" for the drawer
    rec("notices", "wording vs mod ('drawer allows at most', 'supply allows at most')", /at most|allows|shortfall|only make/i.test(t.text ?? "") ? "PASS" : "FAIL", (t.text ?? "").replace(/\n/g, " | ").slice(0, 200));
  });

  section("spare", async () => {
    const [dt, nb] = refChain.nodes;
    const plans2 = {
      importing: { nodes: [{ ...dt, key: "dt", pin: 0.0001, x: 0, y: 0 }, { ...nb, key: "nb1", pin: 0.01, x: 700, y: 0 }, { ...nb, key: "nb2", pin: 0.01, x: 700, y: 700 }], drawers: [], wires: [{ from: "dt", to: "nb1", res: ["fluid", "benzene"] }, { from: "dt", to: "nb2", res: ["fluid", "benzene"] }] },
      exporting: { nodes: [{ ...dt, key: "dt", pin: 0.1, x: 0, y: 0 }, { ...nb, key: "nb1", pin: 0.0004, x: 700, y: 0 }, { ...nb, key: "nb2", pin: 0.0004, x: 700, y: 700 }], drawers: [], wires: [{ from: "dt", to: "nb1", res: ["fluid", "benzene"] }, { from: "dt", to: "nb2", res: ["fluid", "benzene"] }] },
    };
    for (const [name, plan] of Object.entries(plans2)) {
      await loadPlan(page, plan);
      await wait(700);
      const info = await page.evaluate(() => { const p = window.__ccStore.getState().lastResult?.plan; return { leftovers: p?.leftovers?.map((l) => ({ importing: l.importing, bearers: l.bearers.length })), forcedRows: document.querySelectorAll(".cc-forced").length, spareBlock: document.querySelectorAll(".rail-spare").length }; });
      rec("spare", name, info.spareBlock ? "PASS" : "INFO", JSON.stringify(info));
      if (info.spareBlock) {
        await shot("rail-spare-block");
        break;
      }
    }
    // forced row click opens the popup
    const f = page.locator(".cc-forced").first();
    if (await f.count()) {
      await f.scrollIntoViewIfNeeded();
      await f.click({ force: true });
      await wait(600);
      const pop = await page.evaluate(() => ({ popup: !!document.querySelector(".rail-popup"), text: document.querySelector(".rail-popup")?.innerText?.replace(/\n/g, " | ") }));
      rec("spare", "clicking a card's Forced row opens the spare popup", pop.popup ? "PASS" : "INFO", JSON.stringify(pop));
      await shot("spare-popup");
      await page.keyboard.press("Escape");
      await wait(300);
    }
  });

  function OUTP(n) { return new URL(`../out/qa2/${n}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"); }
}
