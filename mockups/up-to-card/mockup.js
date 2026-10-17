// Up to card mockup: cards built from plain specs on the clean card's own classes (clean.css), plus the count block.

// ---- Sprites: tiny pixel items, since the real card draws the dataset's icons ----

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

// ---- Builders ----

const TIERS = {
  LV: { bg: "#00AA00", border: "#005E00", ink: "#ffffff", hover: "#1fb21f", pressed: "#009c00" },
  MV: { bg: "#FFAA00", border: "#8C5E00", ink: "#111111", hover: "#ffb21f", pressed: "#eb9c00" },
  HV: { bg: "#FFFF55", border: "#8C8C2F", ink: "#111111", hover: "#ffff6b", pressed: "#ebeb4e" },
};

function chip(label, tier) {
  const t = TIERS[tier];
  return `<div class="cc-chip" style="--chip-bg:${t.bg};--chip-border:${t.border};--chip-ink:${t.ink};--chip-hover:${t.hover};--chip-pressed:${t.pressed}">${label}</div>`;
}

function icon(p) {
  if (p.fluid) return `<span class="cc-icon cc-swatch" style="background-color:${p.fluid}"></span>`;
  return `<span class="cc-icon" style="background:${SPRITES[p.item]} center / 32px no-repeat;image-rendering:pixelated"></span>`;
}

function words(p) {
  return `${icon(p)}<span class="cc-num" data-unit="${p.unit}"${p.zero ? " data-zero" : ""}>${p.num}</span><span class="cc-pname">${p.name}</span>`;
}

function row(p, side) {
  if (p.power) {
    return `<div class="cc-row" data-power data-side="input"><span class="cc-bolt"></span><span class="cc-num" data-unit="EU/t"${p.zero ? " data-zero" : ""}>${p.num}</span><span class="cc-pname">Power</span></div>`;
  }
  const open = !p.wired && !p.forced;
  const attrs = [
    "data-port",
    `data-side="${side}"`,
    `data-wired="${p.wired || p.forced ? "true" : "false"}"`,
    open ? "data-open" : "",
    p.forced ? "data-forced" : "",
    p.why ? `data-why="${p.why}"` : "",
    p.link ? `data-link="${p.link}"` : "",
  ].join(" ");
  let inner = p.forced
    ? `<div class="cc-line">${words(p)}</div><div class="cc-forced" data-kind="${side === "input" ? "in" : "out"}">${icon(p)}<span class="cc-num" data-unit="${p.unit}">${p.forced}</span><span class="cc-pname">Forced</span></div>`
    : words(p);
  if (open) {
    inner +=
      `<div class="cc-prk" data-side="${side}" data-mode="${p.set ? "exact" : "any"}"></div>` +
      `<div class="cc-prb" data-side="${side}"${p.set ? ` data-set data-unit="${p.unit}"` : ""}>${p.set ?? "Set"}</div>`;
  }
  if ((p.wired || p.forced) && p.wire) inner += `<span class="ut-wire" style="--w:${p.wire}"></span>`;
  return `<div class="cc-row" ${attrs}>${inner}</div>`;
}

function tip(t) {
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
  const actions = `<div class="tp-rule"></div><div class="tp-actions"><span class="tp-action">Click: set the count</span><span class="tp-action">Wheel: +1 / -1</span><span class="tp-action">Key: Any, Exactly, Up to</span></div>`;
  return `<div class="ut-tip"><div class="tp"><div class="tp-title">${t.title}</div>${rows}${notes}${actions}</div></div>`;
}

function count(c) {
  if (c.rule === "today") {
    return `<div class="cc-count" data-pinned data-note="">×${c.set}</div>`;
  }
  const box =
    c.rule === "any"
      ? `<div class="ut-box" data-empty>Set</div>`
      : c.rule === "upto"
        ? `<div class="ut-box"><small>up to</small>${c.set}</div>`
        : `<div class="ut-box">${c.set}</div>`;
  const bar = c.rule === "upto" ? `<div class="ut-bar"><i style="width:${c.pct}%"></i></div>` : "";
  const why = c.why ? `<div class="ut-why">${c.why}</div>` : "";
  return (
    `<div class="ut" data-rule="${c.rule}" data-tone="${c.tone ?? ""}">` +
    `<div class="ut-reached">×${c.reached}</div>` +
    `<div class="ut-set"><div class="ut-key" data-rule="${c.rule}"></div>${box}</div>` +
    `${bar}${why}${tip(c.tip)}</div>`
  );
}

function card(s) {
  const ut = s.count.rule !== "today";
  return (
    `<div class="cc-card">` +
    `<div class="cc-head"><div class="cc-key" data-glyph="menu"></div><div class="cc-key" data-glyph="gear"></div>` +
    `<div class="cc-name" data-picker style="--cc-name-size:${s.name.length > 18 ? 9 : 10}px">${s.name}</div>${chip("1A", s.tier)}${chip(s.tier, s.tier)}</div>` +
    `<div class="cc-rail" data-side="input">${s.inputs.map((p) => row(p, "input")).join("")}${row({ power: true, ...s.power }, "input")}</div>` +
    `<div class="cc-pic"${ut ? " data-ut" : ""}><img class="cc-art" src="/public/power-art/${s.art}.png" alt="" />` +
    (s.circuit ? `<span class="ut-circuit">${s.circuit}</span>` : "") +
    `${count(s.count)}</div>` +
    `<div class="cc-rail" data-side="output">${s.outputs.map((p) => row(p, "output")).join("")}</div>` +
    `</div>`
  );
}

function item(s, extraClass = "") {
  const wrap = document.createElement("div");
  wrap.className = `mk-item ${s.count.rule === "today" ? "" : "mk-new"} ${extraClass}`;
  wrap.innerHTML = `<div class="mk-zoom">${card(s)}</div>${s.caption ? `<div class="mk-cap">${s.caption}</div>` : ""}`;
  return wrap;
}

// ---- The sulfuric acid card in every state ----

const OXY = "#0b9ac0";
const WATER = "#4a5cf0";
const ACID = "#ff7400";

function lcr(scale, count, extra = {}) {
  const f = (v) => {
    const n = v * scale;
    if (n === 0) return "0";
    if (n >= 1000) return `${+(n / 1000).toFixed(2)}k`;
    return `${+n.toFixed(2)}`;
  };
  const zero = scale === 0;
  return {
    name: "Large Chemical Reactor",
    tier: "LV",
    art: "large-chemical-reactor",
    circuit: 24,
    inputs: [
      { item: "dust", num: f(1), unit: "/s", name: "Sulfur Dust", zero },
      { fluid: OXY, num: f(3000), unit: "L/s", name: "Oxygen", wired: true, wire: OXY, zero, ...(extra.oxygen ?? {}) },
      { fluid: WATER, num: f(1000), unit: "L/s", name: "Water", zero },
    ],
    power: { num: f(720), zero },
    outputs: [{ fluid: ACID, num: f(1000), unit: "L/s", name: "Sulfuric Acid", wired: true, wire: ACID, zero, ...(extra.acid ?? {}) }],
    count,
    caption: extra.caption,
  };
}

const states = [
  lcr(1, { rule: "today", set: 24 }, { caption: "<b>Today.</b> A pinned count is exact and sits on the picture." }),
  lcr(
    1,
    {
      rule: "upto",
      set: 24,
      reached: "24",
      pct: 100,
      tone: "full",
      why: "full",
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×24"],
          ["Busy", "100%"],
        ],
        notes: [["All of them running. Nothing around it wants more.", "muted"]],
      },
    },
    { caption: "<b>Up to 24, full.</b> All 24 run and the line is happy." },
  ),
  lcr(
    1,
    {
      rule: "upto",
      set: 24,
      reached: "24",
      pct: 100,
      tone: "bottleneck",
      why: "wants 31",
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×24"],
          ["Busy", "100%"],
          ["Wants", "×31", "red"],
        ],
        notes: [["The line could use 7 more. Build more of this first.", "red"]],
      },
    },
    { caption: "<b>Up to 24, bottleneck.</b> All 24 run flat out and the line still wants 31. Build more here." },
  ),
  lcr(
    0.76,
    {
      rule: "upto",
      set: 24,
      reached: "18.2",
      pct: 76,
      tone: "short",
      why: "short of Oxygen",
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×18.2"],
          ["Busy", "76%"],
        ],
        notes: [["Short of Oxygen: 2.28k of 3k L/s arrives. The electrolyzers upstream are full.", "warn"]],
      },
    },
    {
      oxygen: { why: "short" },
      caption: "<b>Up to 24, short.</b> 18.2 run. Oxygen can't keep up, and its row says so.",
    },
  ),
  lcr(
    0.5,
    {
      rule: "upto",
      set: 24,
      reached: "12",
      pct: 50,
      tone: "backed",
      why: "Acid backing up",
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×12"],
          ["Busy", "50%"],
        ],
        notes: [["Sulfuric Acid is backing up: what takes it is full. Add machines after it or a drawer.", "muted"]],
      },
    },
    {
      acid: { why: "backed" },
      caption: "<b>Up to 24, backed up.</b> 12 run. Whatever takes the acid is full. This was old Build's clog.",
    },
  ),
  lcr(
    0,
    {
      rule: "upto",
      set: 24,
      reached: "0",
      pct: 0,
      tone: "idle",
      why: "not needed",
      tip: {
        title: "Up to 24 machines",
        rows: [
          ["Running", "×0"],
          ["Busy", "0%"],
        ],
        notes: [["Nothing wants what it makes. Wire its output or give it a rate.", "muted"]],
      },
    },
    { caption: "<b>Up to 24, not needed.</b> Nothing takes the acid, so none run." },
  ),
  lcr(
    1,
    {
      rule: "exact",
      set: 24,
      reached: "24",
      tip: {
        title: "Exactly 24 machines",
        rows: [["Running", "×24"]],
        notes: [["Runs all 24 whatever the line does. A gap shows as a forced row.", "muted"]],
      },
    },
    {
      oxygen: { num: "2.28k", forced: "720" },
      caption: "<b>Exactly 24.</b> All 24 run no matter what. Oxygen is 720 L/s short, so it comes in forced.",
    },
  ),
  lcr(
    0.76,
    {
      rule: "any",
      reached: "18.2",
      tip: {
        title: "Machine count: Any",
        rows: [
          ["Calculated", "×18.2"],
          ["Whole machines", "×19"],
        ],
        notes: [["The plan picks how many. Set a number to pin it.", "muted"]],
      },
    },
    { caption: "<b>Any.</b> The plan picks the count. The box asks for a number." },
  ),
];

const grid = document.getElementById("states");
for (const s of states) grid.appendChild(item(s));

// ---- The line: pyrolyse ovens feeding a distillation tower ----

const TAR = "#5a3c1c";
const pyro = {
  name: "Pyrolyse Oven",
  tier: "MV",
  art: "pyrolyse-oven",
  circuit: 10,
  inputs: [
    { item: "log", num: "1", unit: "/s", name: "Oak Wood" },
    { fluid: "#2fb4b4", num: "63", unit: "L/s", name: "Nitrogen" },
  ],
  power: { num: "192" },
  outputs: [
    { item: "charcoal", num: "1.25", unit: "/s", name: "Charcoal" },
    { fluid: TAR, num: "94", unit: "L/s", name: "Wood Tar", wired: true, link: "tar" },
  ],
  count: {
    rule: "upto",
    set: 2,
    reached: "2",
    pct: 100,
    tone: "bottleneck",
    why: "wants 3",
    tip: {
      title: "Up to 2 machines",
      rows: [
        ["Running", "×2"],
        ["Busy", "100%"],
        ["Wants", "×3", "red"],
      ],
      notes: [["The tower could take one more oven's tar. Build more of this first.", "red"]],
    },
  },
  caption: "<b>Pyrolyse Oven: 2 of 2, wants 3.</b> The bottleneck.",
};
const tower = {
  name: "Distillation Tower",
  tier: "HV",
  art: "distillation-tower",
  inputs: [{ fluid: TAR, num: "94", unit: "L/s", name: "Wood Tar", wired: true, why: "short", link: "tar" }],
  power: { num: "320" },
  outputs: [
    { fluid: "#3b3b40", num: "33", unit: "L/s", name: "Benzene" },
    { fluid: "#6b5a3a", num: "8", unit: "L/s", name: "Toluene" },
    { fluid: "#7a5a10", num: "28", unit: "L/s", name: "Creosote" },
  ],
  count: {
    rule: "upto",
    set: 1,
    reached: "0.67",
    pct: 67,
    tone: "short",
    why: "short of Wood Tar",
    tip: {
      title: "Up to 1 machine",
      rows: [
        ["Running", "×0.67"],
        ["Busy", "67%"],
      ],
      notes: [["Short of Wood Tar: 94 of 141 L/s arrives. The Pyrolyse Oven upstream is full.", "warn"]],
    },
  },
  caption: "<b>Distillation Tower: 0.67 of 1.</b> Waiting on tar.",
};

const line = document.getElementById("line");
line.appendChild(item(pyro));
line.appendChild(item(tower));

// The wire between them, drawn in screen pixels once laid out.
function drawLineWire() {
  line.querySelector(".mk-wires")?.remove();
  const box = line.getBoundingClientRect();
  const [from, to] = line.querySelectorAll('[data-link="tar"]');
  if (!from || !to) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  // Only when the two cards sit side by side; a narrow window stacks them.
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

// ---- Page controls ----

document.getElementById("bevel").addEventListener("change", (e) => {
  if (e.target.checked) document.body.setAttribute("data-bevel", "");
  else document.body.removeAttribute("data-bevel");
});
document.getElementById("zoom").addEventListener("change", (e) => {
  document.documentElement.style.setProperty("--z", e.target.value);
  requestAnimationFrame(drawLineWire);
});
document.fonts.ready.then(() => requestAnimationFrame(drawLineWire));
window.addEventListener("resize", () => requestAnimationFrame(drawLineWire));
