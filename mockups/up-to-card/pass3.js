// Up to card mockup, pass 3: each fact once. The count under the machine, one story bar along the foot.

// ---- Sprites ----

function sprite(rows, palette) {
  let rects = "";
  rows.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      if (palette[ch]) rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${palette[ch]}'/>`;
    });
  });
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const SPRITES = {
  dust: sprite(
    [
      "................",
      "................",
      "................",
      "................",
      "................",
      "......aaaa......",
      "....aabcbbaa....",
      "...abbbbbbbba...",
      "..abbbcbbbbbba..",
      "..abbbbbbbcbba..",
      ".abbcbbbbbbbbba.",
      ".abbbbbbbbcbbba.",
      ".adddddddddddda.",
      "..aaaaaaaaaaaa..",
      "................",
      "................",
    ],
    { a: "#4d470c", b: "#c4b52c", c: "#ece070", d: "#8c8020" },
  ),
  log: sprite(
    [
      "................",
      "..aaaaaaaaaaaa..",
      "..abbcbbbcbbba..",
      "..abcbbbcbbbca..",
      "..abbbcbbbbcba..",
      "..abcbbbbcbbba..",
      "..abbbbcbbbbca..",
      "..abcbbbbbcbba..",
      "..abbbcbbcbbba..",
      "..abcbbbbbbcba..",
      "..abbbbcbbbbba..",
      "..abcbbbbcbbca..",
      "..abbbcbbbbbba..",
      "..aaaaaaaaaaaa..",
      "................",
      "................",
    ],
    { a: "#2e2010", b: "#6b5130", c: "#4f3a20" },
  ),
  charcoal: sprite(
    [
      "................",
      "................",
      ".....aaaaa......",
      "...aabbbbbaa....",
      "..abbcbbbbbba...",
      "..abbbbbcbbbba..",
      ".abbbcbbbbbbba..",
      ".abcbbbbbcbbba..",
      ".abbbbbcbbbbba..",
      "..abbbbbbbbcba..",
      "..abbcbbbbbba...",
      "...aabbbbbaa....",
      ".....aaaaa......",
      "................",
      "................",
      "................",
    ],
    { a: "#050505", b: "#262626", c: "#4a4a4a" },
  ),
};

const TIERS = {
  LV: { bg: "#00AA00", border: "#005E00", ink: "#ffffff", hover: "#1fb21f", pressed: "#009c00" },
  MV: { bg: "#FFAA00", border: "#8C5E00", ink: "#111111", hover: "#ffb21f", pressed: "#eb9c00" },
  HV: { bg: "#FFFF55", border: "#8C8C2F", ink: "#111111", hover: "#ffff6b", pressed: "#ebeb4e" },
};

function chip(label, tier) {
  const t = TIERS[tier];
  return `<div class="cc-chip" style="--chip-bg:${t.bg};--chip-border:${t.border};--chip-ink:${t.ink};--chip-hover:${t.hover};--chip-pressed:${t.pressed}">${label}</div>`;
}

function head(s) {
  const size = s.name.length > 18 ? 9 : 10;
  return (
    `<div class="cc-head"><div class="cc-key" data-glyph="menu"></div><div class="cc-key" data-glyph="gear"></div>` +
    `<div class="cc-name" data-picker style="--cc-name-size:${size}px">${s.name}</div>${chip("1A", s.tier)}${chip(s.tier, s.tier)}</div>`
  );
}

function tipHtml(t) {
  if (!t) return "";
  const rows = (t.rows ?? [])
    .map(
      ([label, value, tone]) =>
        `<div class="tp-row"><span class="tp-label">${label}</span><span class="tp-value"${tone ? ` data-tone="${tone}"` : ""}>${value}</span></div>`,
    )
    .join("");
  const notes = (t.notes ?? [])
    .map(([text, tone]) => `<div class="tp-note"${tone ? ` data-tone="${tone}"` : ""}>${text}</div>`)
    .join("");
  return `<div class="tp"><div class="tp-title">${t.title}</div>${rows}${notes}</div>`;
}

// ---- Today's card, for comparison (with Circuit as an input on) ----

function todayRow(p) {
  if (p.circuit) {
    return `<div class="cc-row" data-side="input" style="opacity:0.6"><span class="p2-circ" style="left:8px;top:11px">${p.circuit}</span><span class="cc-num" data-small="" data-unit="">free</span><span class="cc-pname">Circuit ${p.circuit}</span></div>`;
  }
  const ico = p.fluid
    ? `<span class="cc-icon cc-swatch" style="background-color:${p.fluid}"></span>`
    : `<span class="cc-icon" style="background:${SPRITES[p.item]} center / 32px no-repeat;image-rendering:pixelated"></span>`;
  const open = !p.wired;
  let inner = `${ico}<span class="cc-num" data-unit="${p.unit}">${p.num}</span><span class="cc-pname">${p.name}</span>`;
  if (open) inner += `<div class="cc-prk" data-side="${p.side}" data-mode="any"></div><div class="cc-prb" data-side="${p.side}">Set</div>`;
  if (p.wired && p.wire) inner += `<span class="ut-wire" style="--w:${p.wire}"></span>`;
  return `<div class="cc-row" data-port data-side="${p.side}" data-wired="${p.wired ? "true" : "false"}"${open ? " data-open" : ""}>${inner}</div>`;
}

function todayCard(s) {
  const ins = s.inputs.map((p) => todayRow({ ...p, side: "input" })).join("");
  const outs = s.outputs.map((p) => todayRow({ ...p, side: "output" })).join("");
  return (
    `<div class="cc-card">${head(s)}` +
    `<div class="cc-rail" data-side="input">${ins}<div class="cc-row" data-power data-side="input"><span class="cc-bolt"></span><span class="cc-num" data-unit="EU/t">${s.power}</span><span class="cc-pname">Power</span></div></div>` +
    `<div class="cc-pic"><img class="cc-art" src="/public/power-art/${s.art}.png" alt="" /><div class="cc-count" data-pinned data-note="">×${s.set}</div></div>` +
    `<div class="cc-rail" data-side="output">${outs}</div></div>`
  );
}

// ---- Pass 2 card ----

function tile(p, side) {
  if (p.circuit) {
    return `<div class="p2-tile" data-side="input" data-free><span class="p2-circ">${p.circuit}</span><span class="cc-num" data-small="" data-unit="">free</span><span class="cc-pname">Circuit ${p.circuit}</span></div>`;
  }
  const open = !p.wired;
  const ico = p.fluid
    ? `<span class="p2-ico" data-fluid style="background:${p.fluid}"></span>`
    : `<span class="p2-ico" style="background:${SPRITES[p.item]} center / 30px no-repeat;image-rendering:pixelated"></span>`;
  const attrs = [
    `data-side="${side}"`,
    open ? "data-open" : "",
    p.why ? `data-why="${p.why}"` : "",
    p.link ? `data-link="${p.link}"` : "",
  ].join(" ");
  let inner = `${ico}<span class="cc-num" data-unit="${p.unit}"${p.zero ? " data-zero" : ""}>${p.num}</span><span class="cc-pname">${p.name}</span>`;
  if (open) {
    inner += `<div class="cc-prk" data-side="${side}" data-mode="any"></div><div class="cc-prb" data-side="${side}">Set</div>`;
  }
  if (p.wired && p.wire) inner += `<span class="ut-wire" style="--w:${p.wire}"></span>`;
  let html = `<div class="p2-tile" ${attrs}>${inner}</div>`;
  if (p.forced) {
    html += `<div class="p2-tile" data-side="${side}" data-open><span class="p2-ico" data-fluid style="background:${p.fluid}"></span><span class="cc-num" data-unit="${p.unit}">${p.forced}</span><span class="cc-pname">Forced</span></div>`;
  }
  return html;
}


function powerTile(eu) {
  return `<div class="p2-tile" data-side="input"><span class="p3-bolt"></span><span class="cc-num" data-unit="EU/t"${eu === 0 ? " data-zero" : ""}>${eu}</span><span class="cc-pname">Power</span></div>`;
}

const RULE_WORD = { upto: "up to", exact: "exactly", any: "any" };

/** Under the machine: what runs, big and white; what you set, small, the number gold. */
function countBlock(c) {
  const n = c.rule === "any" ? `<span class="p3-n" data-prompt>set</span>` : `<span class="p3-n">${c.set}</span>`;
  return (
    `<div class="p3-count"><div class="p3-run"${c.run === "0" ? " data-idle" : ""}>×${c.run}</div>` +
    `<div class="p3-set"><span class="p3-rule">${RULE_WORD[c.rule]}</span>${n}</div></div>`
  );
}

/** Along the foot: one bar, one word, one line. Nothing when there is nothing to say. */
function strip(st) {
  if (!st) return `<div class="p3-wrap" data-none></div>`;
  const fill = st.fill ?? 0;
  const bar = fill > 0 ? `<i class="p3-fill" style="width:calc(${fill}% - 4px)"></i>` : "";
  const ghost = st.ghost ? `<i class="p3-ghost" style="left:calc(${fill}% - 2px);width:calc(${100 - fill}%)"></i>` : "";
  return (
    `<div class="p3-wrap"><div class="p3-strip" data-tone="${st.tone}">${bar}${ghost}` +
    `<span class="p3-word">${st.word}</span><span class="p3-say">${st.say}</span>${st.frac ? `<span class="p3-frac">${st.frac}</span>` : ""}</div>` +
    `<div class="p3-tip">${tipHtml(st.tip)}</div></div>`
  );
}

function p3Card(s) {
  const ins = s.inputs.map((p) => tile(p, "input")).join("") + powerTile(s.power);
  const outs = s.outputs.map((p) => tile(p, "output")).join("");
  return (
    `<div class="p2-card">${head(s)}` +
    `<div class="p2-rail" data-side="input">${ins}</div>` +
    `<div class="p2-well"><img class="p2-art" src="/public/power-art/${s.art}.png" alt="" />${countBlock(s.count)}</div>` +
    `<div class="p2-rail" data-side="output">${outs}</div>` +
    `${strip(s.strip)}</div>`
  );
}

function item(s) {
  const wrap = document.createElement("div");
  wrap.className = "mk-item";
  wrap.innerHTML = `<div class="mk-zoom">${s.today ? todayCard(s) : p3Card(s)}</div>${s.caption ? `<div class="mk-cap">${s.caption}</div>` : ""}`;
  return wrap;
}

// ---- The sulfuric acid card in every state ----

const OXY = "#0b9ac0";
const WATER = "#4a5cf0";
const ACID = "#ff7400";

function fmt(v) {
  if (v === 0) return "0";
  if (v >= 1000) return `${+(v / 1000).toFixed(2)}k`;
  return `${+v.toFixed(2)}`;
}

function lcr(scale, count, st, extra = {}) {
  const zero = scale === 0;
  return {
    name: "Large Chemical Reactor",
    tier: "LV",
    art: "large-chemical-reactor",
    inputs: [
      { item: "dust", num: fmt(scale), unit: "/s", name: "Sulfur Dust", zero },
      { fluid: OXY, num: fmt(3000 * scale), unit: "L/s", name: "Oxygen", wired: true, wire: OXY, zero, ...(extra.oxygen ?? {}) },
      { fluid: WATER, num: fmt(1000 * scale), unit: "L/s", name: "Water", zero },
      { circuit: 24 },
    ],
    outputs: [
      { fluid: ACID, num: fmt(1000 * scale), unit: "L/s", name: "Sulfuric Acid", wired: true, wire: ACID, zero, ...(extra.acid ?? {}) },
    ],
    power: Math.round(720 * scale),
    count,
    strip: st,
    caption: extra.caption,
  };
}

const upTo = (run) => ({ rule: "upto", set: 24, run });

const states = [
  {
    ...lcr(1, upTo("24"), undefined),
    today: true,
    set: 24,
    inputs: [
      { item: "dust", num: "1", unit: "/s", name: "Sulfur Dust" },
      { fluid: OXY, num: "3k", unit: "L/s", name: "Oxygen", wired: true, wire: OXY },
      { fluid: WATER, num: "1k", unit: "L/s", name: "Water" },
      { circuit: 24 },
    ],
    power: 720,
    caption: "<b>Today</b>, with Circuit as an input on.",
  },
  lcr(
    1,
    upTo("24"),
    {
      tone: "full",
      fill: 100,
      word: "FULL",
      say: "nothing wants more",
      frac: "24 / 24",
      tip: { title: "All 24 running", rows: [["Usage", "100%"]], notes: [["Everything around it is happy.", "muted"]] },
    },
    { caption: "<b>Full.</b> All 24 run and nothing wants more." },
  ),
  lcr(
    1,
    upTo("24"),
    {
      tone: "bottleneck",
      fill: 77.4,
      ghost: true,
      word: "BOTTLENECK",
      say: "the line wants 31",
      frac: "24 / 31",
      tip: {
        title: "All 24 running, the line wants 31",
        rows: [
          ["Usage", "100%"],
          ["Wants", "×31", "red"],
        ],
        notes: [["7 more here would let the whole line run faster. Build these first.", "red"]],
      },
    },
    { caption: "<b>Bottleneck.</b> All 24 run. The striped end is the 7 more the line wants." },
  ),
  lcr(
    0.76,
    upTo("18.2"),
    {
      tone: "starved",
      fill: 76,
      word: "STARVED",
      say: "short of Oxygen",
      frac: "18.2 / 24",
      tip: {
        title: "18.2 of 24 running",
        rows: [
          ["Usage", "76%"],
          ["Oxygen", "2.28k of 3k L/s", "warn"],
        ],
        notes: [["The electrolyzers upstream are full. They are the bottleneck.", "muted"]],
      },
    },
    { caption: "<b>Starved.</b> 18.2 run. Oxygen can't keep up." },
  ),
  lcr(
    0.5,
    upTo("12"),
    {
      tone: "clogged",
      fill: 50,
      word: "CLOGGED",
      say: "Sulfuric Acid has nowhere to go",
      frac: "12 / 24",
      tip: {
        title: "12 of 24 running",
        rows: [["Usage", "50%"]],
        notes: [["What takes the acid is full. Add machines after it or a drawer.", "muted"]],
      },
    },
    { caption: "<b>Clogged.</b> 12 run. The acid backs up." },
  ),
  lcr(
    0,
    upTo("0"),
    {
      tone: "unused",
      fill: 0,
      word: "UNUSED",
      say: "nothing takes Sulfuric Acid",
      frac: "0 / 24",
      tip: { title: "None running", rows: [["Usage", "0%"]], notes: [["Wire its output or give it a rate.", "muted"]] },
    },
    { caption: "<b>Unused.</b> Nothing takes the acid so none run." },
  ),
  lcr(
    1,
    { rule: "exact", set: 24, run: "24" },
    {
      tone: "forced",
      fill: 0,
      word: "FORCED IN",
      say: "720 L/s of Oxygen to keep all 24 running",
      tip: {
        title: "Exactly 24 running",
        rows: [["Forced in", "720 L/s Oxygen"]],
        notes: [["Switch to up to and it runs what the oxygen allows instead.", "muted"]],
      },
    },
    {
      oxygen: { num: "2.28k", forced: "720" },
      caption: "<b>Exactly.</b> All 24 run no matter what. The gap shows as a forced tile and the bar says why.",
    },
  ),
  lcr(0.76, { rule: "any", run: "18.2" }, undefined, {
    caption: "<b>Any.</b> The plan picks the count. Nothing to explain, so no bar.",
  }),
];

const grid = document.getElementById("states");
for (const s of states) grid.appendChild(item(s));

// ---- The line ----

const TAR = "#5a3c1c";
const line = document.getElementById("line");
line.appendChild(
  item({
    name: "Pyrolyse Oven",
    tier: "MV",
    art: "pyrolyse-oven",
    inputs: [
      { item: "log", num: "1", unit: "/s", name: "Oak Wood" },
      { fluid: "#2fb4b4", num: "63", unit: "L/s", name: "Nitrogen" },
      { circuit: 10 },
    ],
    outputs: [
      { item: "charcoal", num: "1.25", unit: "/s", name: "Charcoal" },
      { fluid: TAR, num: "94", unit: "L/s", name: "Wood Tar", wired: true, link: "tar" },
    ],
    power: 192,
    count: { rule: "upto", set: 2, run: "2" },
    strip: {
      tone: "bottleneck",
      fill: 66.7,
      ghost: true,
      word: "BOTTLENECK",
      say: "the tower wants 3",
      frac: "2 / 3",
      tip: {
        title: "Both running, the line wants 3",
        rows: [
          ["Usage", "100%"],
          ["Wants", "×3", "red"],
        ],
        notes: [["One more oven would keep the tower busy. Build this first.", "red"]],
      },
    },
    caption: "<b>Pyrolyse Oven.</b> Both run flat out. The tower wants a third.",
  }),
);
line.appendChild(
  item({
    name: "Distillation Tower",
    tier: "HV",
    art: "distillation-tower",
    inputs: [{ fluid: TAR, num: "94", unit: "L/s", name: "Wood Tar", wired: true, link: "tar" }],
    outputs: [
      { fluid: "#3b3b40", num: "33", unit: "L/s", name: "Benzene" },
      { fluid: "#6b5a3a", num: "8", unit: "L/s", name: "Toluene" },
      { fluid: "#7a5a10", num: "28", unit: "L/s", name: "Creosote" },
    ],
    power: 320,
    count: { rule: "upto", set: 1, run: "0.67" },
    strip: {
      tone: "starved",
      fill: 67,
      word: "STARVED",
      say: "short of Wood Tar",
      frac: "0.67 / 1",
      tip: {
        title: "0.67 of 1 running",
        rows: [
          ["Usage", "67%"],
          ["Wood Tar", "94 of 141 L/s", "warn"],
        ],
        notes: [["The Pyrolyse Oven upstream is full. It is the bottleneck.", "muted"]],
      },
    },
    caption: "<b>Distillation Tower.</b> Waiting on tar.",
  }),
);

function drawLineWire() {
  line.querySelector(".mk-wires")?.remove();
  const box = line.getBoundingClientRect();
  const [from, to] = line.querySelectorAll('[data-link="tar"]');
  if (!from || !to) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (b.left < a.right) return;
  const z = Number(getComputedStyle(document.documentElement).getPropertyValue("--z")) || 2;
  const x1 = a.right - box.left + 4 * z;
  const y1 = a.top + a.height / 2 - box.top;
  const x2 = b.left - box.left - 4 * z;
  const y2 = b.top + b.height / 2 - box.top;
  const mid = (x1 + x2) / 2;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "mk-wires");
  svg.innerHTML =
    `<path d="M${x1} ${y1} H${mid} V${y2} H${x2}" fill="none" stroke="${TAR}" stroke-width="${3 * z}" />` +
    `<path d="M${x2 - 5 * z} ${y2 - 5 * z} L${x2} ${y2} L${x2 - 5 * z} ${y2 + 5 * z}" fill="none" stroke="${TAR}" stroke-width="${2 * z}" />`;
  line.appendChild(svg);
}

document.getElementById("zoom").addEventListener("change", (e) => {
  document.documentElement.style.setProperty("--z", e.target.value);
  requestAnimationFrame(drawLineWire);
});
document.fonts.ready.then(() => requestAnimationFrame(drawLineWire));
window.addEventListener("resize", () => requestAnimationFrame(drawLineWire));
