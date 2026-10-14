// Sticky notes and the chrome around the board.
export default function ({ page, wait, rec, check, shot, idle, section, loadPlan, plans }) {
  const { refChain } = plans;
  const emptyPoint = async () =>
    page.evaluate(() => {
      for (let y = 300; y < 1000; y += 40)
        for (let x = 500; x < 1500; x += 40) {
          const el = document.elementFromPoint(x, y);
          if (el && el.closest(".react-flow__pane") && !el.closest(".react-flow__node,.react-flow__edge,button,aside")) return { x, y };
        }
      return null;
    });
  const notes = () => page.evaluate(() => (window.__ccStore.getState().project.annotations ?? []).map((a) => ({ id: a.id, type: a.type ?? a.kind, x: a.position?.x ?? a.x, y: a.position?.y ?? a.y, w: a.width ?? a.size?.width, h: a.height ?? a.size?.height, text: a.text, color: a.color ?? a.tint })));
  const snRect = () => page.evaluate(() => { const e = document.querySelector(".sn"); const r = e?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; });

  section("notes", async () => {
    await loadPlan(page, { nodes: [], drawers: [], wires: [] });
    await wait(300);
    const p = await emptyPoint();
    await page.mouse.click(p.x, p.y, { button: "right" });
    await wait(400);
    const menu = await page.evaluate(() => [...document.querySelectorAll("[role=menuitem], [role=menu] button, .library-menu button")].map((e) => e.textContent.trim()));
    rec("notes", "board right-click menu", "INFO", JSON.stringify(menu));
    check("notes", "right-click empty board offers Add a sticky note", menu.some((m) => /sticky note/i.test(m)), JSON.stringify(menu));
    await shot("board-context-menu", { x: p.x - 100, y: p.y - 40, width: 500, height: 300 });
    await page.getByText(/Add a sticky note/i).first().click();
    await wait(700);
    let r = await snRect();
    check("notes", "a note appears", !!r, JSON.stringify(r));
    if (!r) return;
    rec("notes", "default size (mod note: 120 x 90 GUI?)", "INFO", `${r.w}x${r.h} css`);
    await shot("note-new", { x: r.x - 20, y: r.y - 20, width: r.w + 40, height: r.h + 40 });
    // click to write
    await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
    await wait(300);
    await page.keyboard.type("hello");
    await wait(300);
    // the note keeps its words in the box until it lets go of the keyboard (as the mod's does), so read the box
    const box = () => page.evaluate(() => document.querySelector(".sn textarea")?.value ?? null);
    const txt = [await box()];
    check("notes", "click then type writes into the note", txt.some((t) => /hello/.test(t ?? "")), JSON.stringify(txt));
    // drag while writing
    const before = await snRect();
    await page.mouse.move(before.x + before.w / 2, before.y + before.h / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.w / 2 + 60, before.y + before.h / 2 + 30, { steps: 5 });
    await page.mouse.up();
    await wait(400);
    const after = await snRect();
    check("notes", "dragging anywhere moves the note even while writing", Math.abs(after.x - before.x - 60) <= 10 && Math.abs(after.y - before.y - 30) <= 10, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    const txt2 = [await box()];
    check("notes", "text survives the drag (no selection typed in)", txt2.some((t) => /^hello$/.test(t ?? "")), JSON.stringify(txt2));
    // hover keys
    await page.keyboard.press("Escape");
    await page.mouse.click(1300, 900);
    await idle();
    await wait(300);
    const keysIdle = await page.evaluate(() => [...document.querySelectorAll(".sn-key")].filter((k) => getComputedStyle(k).opacity !== "0" && getComputedStyle(k).display !== "none").length);
    const r2 = await snRect();
    await page.mouse.move(r2.x + r2.w / 2, r2.y + r2.h / 2);
    await wait(500);
    const keysHover = await page.evaluate(() => [...document.querySelectorAll(".sn-key")].filter((k) => getComputedStyle(k).opacity !== "0" && getComputedStyle(k).display !== "none").map((k) => { const b = k.getBoundingClientRect(); return { k: k.dataset.key, w: b.width, x: b.x, y: b.y }; }));
    check("notes", "keys hidden at rest, shown on hover (delete, text size)", keysIdle === 0 && keysHover.length >= 2, `idle ${keysIdle}, hover ${JSON.stringify(keysHover)}`);
    await shot("note-hover", { x: r2.x - 20, y: r2.y - 30, width: r2.w + 40, height: r2.h + 60 });
    // resize: bottom-right corner
    const r3 = await snRect();
    await page.mouse.move(r3.x + r3.w - 4, r3.y + r3.h - 4);
    await page.mouse.down();
    await page.mouse.move(r3.x + r3.w + 40, r3.y + r3.h + 30, { steps: 5 });
    await page.mouse.up();
    await wait(400);
    const r4 = await snRect();
    check("notes", "dragging the folded corner resizes", r4.w > r3.w + 20 && r4.h > r3.h + 15, `${r3.w}x${r3.h} -> ${r4.w}x${r4.h}`);
    // edge resize
    await page.mouse.move(r4.x + r4.w - 1, r4.y + r4.h / 2);
    await page.mouse.down();
    await page.mouse.move(r4.x + r4.w + 30, r4.y + r4.h / 2, { steps: 4 });
    await page.mouse.up();
    await wait(300);
    const r5 = await snRect();
    check("notes", "dragging an edge resizes", r5.w > r4.w + 15, `${r4.w} -> ${r5.w}`);
    // colour menu
    await page.mouse.click(r5.x + r5.w / 2, r5.y + r5.h / 2, { button: "right" });
    await wait(400);
    const m2 = await page.evaluate(() => [...document.querySelectorAll("[role=menuitem], [role=menu] button, .library-menu button")].map((e) => e.textContent.trim()));
    rec("notes", "note right-click menu", "INFO", JSON.stringify(m2));
    await shot("note-menu", { x: r5.x - 50, y: r5.y - 50, width: 600, height: 500 });
    check("notes", "menu offers colour, text size and delete", /colou?r/i.test(m2.join("|")) && /(bigger|smaller) text/i.test(m2.join("|")) && /delete/i.test(m2.join("|")), JSON.stringify(m2));
    const colorItem = page.getByText(/colou?r/i).first();
    if (await colorItem.count()) {
      await colorItem.click();
      await wait(400);
      await shot("note-colours", { x: r5.x - 50, y: r5.y - 50, width: 600, height: 500 });
      const sw = await page.evaluate(() => document.querySelectorAll("[data-swatch], .library-menu [style*='background']").length);
      rec("notes", "colour picker swatches", "INFO", String(sw));
    }
    await page.keyboard.press("Escape");
    // old annotations hidden
    const tools = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.title).filter((t) => /box|arrow|zone|image|text|annotat/i.test(t ?? "")));
    rec("notes", "box/arrow/zone/image annotation tools hidden on this board", tools.length === 0 ? "PASS" : "FAIL", JSON.stringify(tools));
  });

  section("chrome", async () => {
    await loadPlan(page, refChain);
    await wait(500);
    await page.screenshot({ path: new URL("../out/qa2/chrome-top.png", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), clip: { x: 0, y: 0, width: 1920, height: 130 } });
    const bar = await page.evaluate(() => [...document.querySelectorAll("header button, header a, [role=tab], button, .mb-key")].filter((b) => b.getBoundingClientRect().y < 130).map((b) => (b.getAttribute("aria-label") || b.title || b.textContent).trim().slice(0, 30)).filter(Boolean));
    rec("chrome", "top bar keys", "INFO", JSON.stringify(bar) + "  (mod: Arrange, Fit, /s, EU/t, Avg, Library, Share, feedback bug, gear, ?; plus +, undo, redo, Non-recipe)");
    // the features the mod has: do they exist?
    const text = () => page.evaluate(() => document.body.innerText);
    const probe = async (label, finder) => {
      const t = await finder();
      rec("missing", label, t ? "PASS" : "FAIL", String(t));
    };
    await probe("Arrange key on the top bar", async () => (await page.locator('[aria-label*="rrange" i], [title*="rrange" i]').count()) || /Arrange/.test(await text()));
    await probe("Fit key", async () => (await page.locator('[aria-label="Fit"], [title="Fit"]').count()) > 0);
    await probe("Avg/Peak key", async () => /\bAvg\b|\bPeak\b/.test(await text()));
    // settings
    const gear = page.locator('[aria-label="Settings"], button[title*="Settings" i]').first();
    if (await gear.count()) {
      await gear.click();
      await wait(700);
      await shot("settings-open");
      const secs = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] h2, [role=dialog] h3, [role=dialog] legend, [role=dialog] label")].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 60));
      rec("chrome", "settings contents", "INFO", JSON.stringify(secs));
      const need = ["See-through", "Size", "Sound", "Minimap", "Controls", "Board"]; // the mod's Pin list is a world feature, not on the website
      const body = await text();
      for (const n of need) rec("missing", `settings: ${n} (mod section)`, new RegExp(n, "i").test(body) ? "PASS" : "FAIL", "");
      await page.keyboard.press("Escape");
      await wait(300);
    } else rec("chrome", "settings gear", "FAIL", "not found");
    // library
    await page.getByText("Library", { exact: true }).first().click().catch(() => {});
    await wait(1200);
    await shot("library-open");
    const lib = await text();
    rec("chrome", "library has My plans and public shelf", /My plans|My designs/i.test(lib) && /Public|Community/i.test(lib) ? "PASS" : "INFO", lib.slice(0, 200).replace(/\n/g, " | "));
    await page.locator('.mb-key:text-is("Board")').first().click().catch(() => {});
    await wait(500);
    // screenshot panel
  });
}
