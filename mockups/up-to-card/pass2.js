// Up to card mockup, pass 2: tiles for ports, a well for the machine, a footer of sections.

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

const RULE_LABEL = { upto: "UP TO", exact: "EXACTLY", any: "ANY" };

function footer(f) {
  const bar = f.pct === undefined ? "" : `<div class="p2-bar"><i style="width:${f.pct}%"></i></div>`;
  const number = f.rule === "any" ? `<div class="p2-num" data-auto>auto</div>` : `<div class="p2-num">${f.set}</div>`;
  return (
    `<div class="p2-foot">` +
    `<div class="p2-cell" data-k="usage"><div class="p2-lab">USAGE</div><div class="p2-val">${f.pct === undefined ? "-" : `${f.pct}%`}</div>${bar}</div>` +
    `<div class="p2-cell" data-k="reason"><div class="p2-lab">REASON</div><div class="p2-val">${f.word}</div><div class="p2-sub">${f.sub ?? ""}</div></div>` +
    `<div class="p2-cell" data-k="power"><div class="p2-lab">POWER</div><div class="p2-val">${f.power}<small>EU/t</small></div></div>` +
    `<div class="p2-cell" data-k="machines"><div class="p2-lab" data-rule="${f.rule}">${RULE_LABEL[f.rule]}</div><div class="p2-step"><div class="p2-k">-</div>${number}<div class="p2-k">+</div></div></div>` +
    `<div class="p2-tip">${tipHtml(f.tip)}</div>` +
    `</div>`
  );
}

function p2Card(s) {
  const ins = s.inputs.map((p) => tile(p, "input")).join("");
  const outs = s.outputs.map((p) => tile(p, "output")).join("");
  return (
    `<div class="p2-card" data-tone="${s.foot.tone}">${head(s)}` +
    `<div class="p2-rail" data-side="input">${ins}</div>` +
    `<div class="p2-well"><img class="p2-art" src="/public/power-art/${s.art}.png" alt="" /><div class="p2-run"${s.run === "0" ? " data-idle" : ""}>×${s.run}</div></div>` +
    `<div class="p2-rail" data-side="output">${outs}</div>` +
    `${footer(s.foot)}</div>`
  );
}

function item(s) {
  const wrap = document.createElement("div");
  wrap.className = "mk-item";
  wrap.innerHTML = `<div class="mk-zoom">${s.today ? todayCard(s) : p2Card(s)}</div>${s.caption ? `<div class="mk-cap">${s.caption}</div>` : ""}`;
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

function lcr(scale, foot, extra = {}) {
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
    run: extra.run,
    foot: { power: Math.round(720 * scale), ...foot },
    caption: extra.caption,
  };
}

const states = [
  {
    ...lcr(1, {}),
    today: true,
    set: 24,
    inputs: [
      { item: "dust", num: "1", unit: "/s", name: "Sulfur Dust" },
      { fluid: OXY, num: "3k", unit: "L/s", name: "Oxygen", wired: true, wire: OXY },
      { fluid: WATER, num: "1k", unit: "L/s", name: "Water" },
      { circuit: 24 },
    ],
    caption: "<b>Today</b>, with Circuit as an input on.",
  },
  lcr(
    1,
    {
      tone: "full",
      pct: 100,
      word: "FULL",
      sub: "nothing wants more",
      rule: "upto",
      set: 24,
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×24"],
          ["Usage", "100%"],
        ],
        notes: [["All 24 run. Nothing around it wants more.", "muted"]],
      },
    },
    { run: "24", caption: "<b>Up to 24, full.</b> All 24 run and the line is happy." },
  ),
  lcr(
    1,
    {
      tone: "bottleneck",
      pct: 100,
      word: "BOTTLENECK",
      sub: "wants ×31",
      rule: "upto",
      set: 24,
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×24"],
          ["Usage", "100%"],
          ["Wants", "×31", "red"],
        ],
        notes: [["The line could use 7 more. Build more of this first.", "red"]],
      },
    },
    { run: "24", caption: "<b>Up to 24, bottleneck.</b> All 24 run flat out and the line still wants 31." },
  ),
  lcr(
    0.76,
    {
      tone: "starved",
      pct: 76,
      word: "STARVED",
      sub: "short of Oxygen",
      rule: "upto",
      set: 24,
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×18.2"],
          ["Usage", "76%"],
        ],
        notes: [["Short of Oxygen: 2.28k of 3k L/s arrives. The electrolyzers upstream are full.", "warn"]],
      },
    },
    {
      run: "18.2",
      oxygen: { why: "starved" },
      caption: "<b>Up to 24, starved.</b> 18.2 run. Oxygen can't keep up and its tile says so.",
    },
  ),
  lcr(
    0.5,
    {
      tone: "clogged",
      pct: 50,
      word: "CLOGGED",
      sub: "Sulfuric Acid",
      rule: "upto",
      set: 24,
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×12"],
          ["Usage", "50%"],
        ],
        notes: [["Sulfuric Acid backs up: what takes it is full. Add machines after it or a drawer.", "muted"]],
      },
    },
    {
      run: "12",
      acid: { why: "clogged" },
      caption: "<b>Up to 24, clogged.</b> 12 run. Whatever takes the acid is full.",
    },
  ),
  lcr(
    0,
    {
      tone: "unused",
      pct: 0,
      word: "UNUSED",
      sub: "nothing takes it",
      rule: "upto",
      set: 24,
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×0"],
          ["Usage", "0%"],
        ],
        notes: [["Nothing wants what it makes. Wire its output or give it a rate.", "muted"]],
      },
    },
    { run: "0", caption: "<b>Up to 24, unused.</b> Nothing takes the acid, so none run." },
  ),
  lcr(
    1,
    {
      tone: "forced",
      pct: 100,
      word: "FORCED IN",
      sub: "Oxygen 720 L/s",
      rule: "exact",
      set: 24,
      tip: {
        title: "Exactly 24 machines",
        rows: [["Running", "×24"]],
        notes: [["Runs all 24 whatever the line does. Oxygen is short, so 720 L/s is forced in.", "muted"]],
      },
    },
    {
      run: "24",
      oxygen: { num: "2.28k", forced: "720" },
      caption: "<b>Exactly 24.</b> All 24 run no matter what. The missing oxygen comes in forced.",
    },
  ),
  lcr(
    0.76,
    {
      tone: "demand",
      pct: 96,
      word: "ON DEMAND",
      sub: "sized by the plan",
      rule: "any",
      tip: {
        title: "Machine count: Any",
        rows: [
          ["Calculated", "×18.2"],
          ["Whole machines", "×19"],
          ["Usage", "96%"],
        ],
        notes: [["The plan picks how many. Press + or - to pin it.", "muted"]],
      },
    },
    { run: "18.2", caption: "<b>Any.</b> The plan picks the count. Usage is of the 19 you'd build." },
  ),
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
    run: "2",
    foot: {
      tone: "bottleneck",
      pct: 100,
      word: "BOTTLENECK",
      sub: "wants ×3",
      power: 192,
      rule: "upto",
      set: 2,
      tip: {
        title: "Up to 2 machines",
        rows: [
          ["Running", "×2"],
          ["Usage", "100%"],
          ["Wants", "×3", "red"],
        ],
        notes: [["The tower could take one more oven's tar. Build more of this first.", "red"]],
      },
    },
    caption: "<b>Pyrolyse Oven.</b> Both run flat out and the tower wants more.",
  }),
);
line.appendChild(
  item({
    name: "Distillation Tower",
    tier: "HV",
    art: "distillation-tower",
    inputs: [{ fluid: TAR, num: "94", unit: "L/s", name: "Wood Tar", wired: true, why: "starved", link: "tar" }],
    outputs: [
      { fluid: "#3b3b40", num: "33", unit: "L/s", name: "Benzene" },
      { fluid: "#6b5a3a", num: "8", unit: "L/s", name: "Toluene" },
      { fluid: "#7a5a10", num: "28", unit: "L/s", name: "Creosote" },
    ],
    run: "0.67",
    foot: {
      tone: "starved",
      pct: 67,
      word: "STARVED",
      sub: "short of Wood Tar",
      power: 320,
      rule: "upto",
      set: 1,
      tip: {
        title: "Up to 1 machine",
        rows: [
          ["Running", "×0.67"],
          ["Usage", "67%"],
        ],
        notes: [["Short of Wood Tar: 94 of 141 L/s arrives. The Pyrolyse Oven upstream is full.", "warn"]],
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
