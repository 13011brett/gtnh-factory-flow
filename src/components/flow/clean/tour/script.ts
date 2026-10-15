"use client";

import { isLiveConfigured } from "@/lib/live/live-config";
import { useFactoryStore } from "@/store/factory-store";
import { setMinimap } from "../minimap/minimap-settings";
import { setSeeThrough } from "../seethrough/see-through";
import { A, type Action, type Step } from "./director";
import { pressKey } from "./input";
import {
  addRecipe,
  barKey,
  around,
  leftOf,
  rightOf,
  underCard,
  boardSpot,
  cardPart,
  drawerOf,
  drawerPart,
  feedbackKey,
  fitKey,
  libraryKey,
  itemTile,
  itemsSearch,
  menuRow,
  nodeCount,
  settingsSheet,
  portBox,
  portHandle,
  powerKey,
  powerUnitKey,
  rateUnitKey,
  railLine,
  railRoot,
  railSection,
  recipeOverlay,
  redoKey,
  solved,
  storageCount,
  topKey,
  undoKey,
} from "./script-targets";
import { card, css, portRow, textOf, within, type Target } from "./targets";

/**
 * The tour, step by step (the mod's Script, on the website's planner): each step acts something out on the real UI,
 * then a note beside what it did says what it is. Words between asterisks are gold. Steps that need the game
 * (NEI, placing in the world, the pin list) are left out; the minimap and the feedback box are in.
 * Write notes short and plain, one sentence a thought, no commas where a full stop will do.
 */

const store = () => useFactoryStore.getState();

/** The machine count the solver gave the nth card. */
function machines(index: number): number {
  const id = store().project.nodes[index]?.id;
  return id ? (store().lastResult.nodes[id]?.theoreticalMachinesRequired ?? 0) : 0;
}

function pinnedCount(index: number): number | undefined {
  return store().project.nodes[index]?.solvePin;
}

function setNode(index: number, patch: Record<string, unknown>) {
  const id = store().project.nodes[index]?.id;
  if (id) store().updateNode(id, patch);
}

/** Clears a card's port pins and count pin through the store: the way a step puts the plan back to a known state. */
function unpin(index: number) {
  setNode(index, { portRates: undefined, solvePin: undefined });
}

const fit = A.click(fitKey, { label: "Fit key" });
const closeMenus = A.run(() => {
  pressKey("Escape");
});

const BENDER = /Bending Machine/;

// region From the items list to a card

/** Search for the plates and open their recipes, down to the bender's add key. */
const openPlateRecipes: Action[] = [
  A.run(() => {
    store().clearResourceBrowser();
    store().setRecipeSearch("");
  }),
  A.type(itemsSearch, "iron plate", { label: "items search" }),
  A.until(() => itemTile("Iron Plate")() !== null, "Iron Plate in the list"),
  A.click(itemTile("Iron Plate"), { label: "Iron Plate" }),
  A.until(() => recipeOverlay() !== null, "recipe search"),
  A.wait(300),
  A.until(() => addRecipe(BENDER)() !== null, "the bender's recipe", 20000),
  A.show(addRecipe(BENDER)),
  A.wait(250),
];

const findRecipe: Step = {
  id: "find-recipe",
  actions: openPlateRecipes,
  note: { text: "This key *adds a recipe to a plan*.", at: addRecipe(BENDER) },
};

const firstCard: Step = {
  id: "card",
  actions: [
    // Back to this step starts with the search shut; open it again.
    A.when(() => addRecipe(BENDER)() === null, A.seq(...openPlateRecipes)),
    A.click(addRecipe(BENDER), { label: "add the bender's recipe" }),
    A.until(() => nodeCount() === 1, "the card"),
    A.until(solved, "the solve"),
    A.wait(200),
    fit,
    A.wait(400),
  ],
  note: {
    text: "This is a *recipe in a plan*. It does nothing yet: nothing has told it how much to make.",
    at: card(0),
    bare: true,
  },
};

// endregion

// region Getting around

const mouseAround: Step = {
  id: "mouse",
  actions: [
    fit,
    A.wait(300),
    A.drag(boardSpot(0.25, 0.72), boardSpot(0.33, 0.6), { label: "pan" }),
    A.wheel(boardSpot(0.5, 0.5), -240, { times: 2, label: "zoom in" }),
    A.wheel(boardSpot(0.5, 0.5), 240, { times: 2, label: "zoom out" }),
    fit,
  ],
  note: {
    text:
      "{M} *Middle mouse* to pan.\n{W} *Scroll* to zoom.\n{L} *Left click* to pan, or drag things around.\nTry it, then press next.",
    nothing: true,
  },
};

const keysAround: Step = {
  id: "keys",
  actions: [
    fit,
    A.wait(300),
    A.key("d", { hold: 450, caps: ["D"] }),
    A.key("a", { hold: 450, caps: ["A"] }),
    A.key("PageUp", { hold: 350, caps: ["Page Up"] }),
    A.key("PageDown", { hold: 350, caps: ["Page Down"] }),
    fit,
  ],
  note: {
    text:
      "{K} *W A S D* or the *arrow keys* to pan.\n{K} *Page Up* and *Page Down*, or *+* and *-*, to zoom.\nTry it, then press next.",
    nothing: true,
  },
};

// endregion

// region Numbers to solve for

const pinNumber: Step = {
  id: "number",
  actions: [
    fit,
    A.type(portBox(0, "Output", "Iron Plate"), "10", { enter: true, label: "the plates' rate box" }),
    A.until(() => machines(0) > 0, "the card's count"),
    A.until(solved, "the solve"),
    A.wait(300),
  ],
  note: { text: "You can *pin a number* and it calculates the other numbers.", at: card(0) },
};

const pinCount: Step = {
  id: "count",
  actions: [
    A.run(() => unpin(0)),
    A.wait(300),
    A.type(cardPart(0, "count"), "2", { enter: true, label: "the count" }),
    A.until(() => pinnedCount(0) === 2, "the pinned count"),
    A.until(solved, "the solve"),
    A.wait(300),
  ],
  note: { text: "Or pin the *machine count*.", at: cardPart(0, "count") },
};

const pinInput: Step = {
  id: "input",
  actions: [
    A.run(() => unpin(0)),
    A.wait(300),
    A.type(portBox(0, "Input", "Iron Ingot"), "5", { enter: true, label: "the ingots' rate box" }),
    A.until(() => machines(0) > 0, "the card's count"),
    A.until(solved, "the solve"),
    A.wait(300),
  ],
  note: {
    text: "Or pin an *input*.",
    at: around(portRow(0, "Input", "Iron Ingot"), portBox(0, "Input", "Iron Ingot")),
  },
};

// endregion

// region The machine

const tierStep: Step = {
  id: "tier",
  actions: [
    A.run(() => unpin(0)),
    A.wait(200),
    A.click(cardPart(0, "tier"), { label: "tier chip" }),
    A.wait(300),
    A.click(cardPart(0, "tier"), { button: 2, label: "tier chip" }),
    A.until(solved, "the solve"),
    A.wait(300),
  ],
  note: { text: "Set the machine's *tier* here.", at: cardPart(0, "tier") },
};

const powerStep: Step = {
  id: "power",
  actions: [A.wait(250)],
  note: {
    text: "Power use is shown here, but machines *don't need to be wired to power*. The circuit is also shown.",
    at: around(cardPart(0, "power"), cardPart(0, "picture")),
  },
};

const settingsStep: Step = {
  id: "settings",
  actions: [A.click(cardPart(0, "gear"), { label: "settings key" }), A.wait(500)],
  note: {
    text: "This is the *settings panel*. If it has any settings, you can *pin* them to show them on the card.",
    at: () => settingsSheet() ?? cardPart(0, "gear")(),
  },
};

// endregion

// region Drawers

const cloneStep: Step = {
  id: "clone",
  actions: [
    closeMenus,
    A.run(() => unpin(0)),
    A.click(cardPart(0, "menu"), { label: "card menu" }),
    A.click(menuRow(/Clone/i), { label: "Clone" }),
    A.until(() => nodeCount() === 2, "the clone"),
    A.wait(300),
    // The clone lands beside its card; a hand moves it under.
    A.drag(cardPart(1, "head"), underCard(card(0), card(1), cardPart(1, "head")), { label: "move the clone" }),
    A.wait(300),
    fit,
    A.wait(500),
  ],
  note: { text: "You can *clone* machines.", at: card(1) },
};

const drawerFromPort: Step = {
  id: "drawer-port",
  actions: [
    A.drag(portHandle(0, "Output", "Iron Plate"), rightOf(card(0), 130), { label: "the plates" }),
    A.until(() => storageCount() >= 1, "the drawer"),
    A.wait(300),
  ],
  note: { text: "Drag an *input* or an *output* to make it a *drawer*.", at: drawerOf("Iron Plate") },
};

const drawerFromItems: Step = {
  id: "drawer-items",
  actions: [
    A.type(itemsSearch, "iron ingot", { label: "items search" }),
    A.until(() => itemTile("Iron Ingot")() !== null, "Iron Ingot in the list"),
    A.dragItem(itemTile("Iron Ingot"), leftOf(card(0), 130), { label: "Iron Ingot" }),
    A.until(() => drawerOf("Iron Ingot")() !== null, "the ingots' drawer"),
    A.wait(300),
  ],
  note: { text: "Or bring one in from the *items list*.", at: drawerOf("Iron Ingot") },
};

const wiring: Step = {
  id: "wiring",
  actions: [
    A.drag(portHandle(1, "Output", "Iron Plate"), drawerPart("Iron Plate", "body"), { label: "second plates wire" }),
    A.wait(300),
    A.drag(drawerPart("Iron Ingot", "body"), portHandle(0, "Input", "Iron Ingot"), { label: "ingot wire" }),
    A.wait(300),
    A.drag(drawerPart("Iron Ingot", "body"), portHandle(1, "Input", "Iron Ingot"), { label: "second ingot wire" }),
    A.wait(300),
    A.type(drawerPart("Iron Plate", "rate"), "20", { enter: true, label: "the plates drawer's rate" }),
    A.until(solved, "the solve"),
    A.type(cardPart(0, "count"), "7", { enter: true, label: "the first count" }),
    A.until(() => pinnedCount(0) === 7, "the pinned count"),
    A.until(solved, "the solve"),
    A.wait(300),
  ],
  note: {
    text: "*Drag from a drawer* to wire it. Set the drawer's *rate* and it applies to every machine wired to it.",
    at: drawerPart("Iron Plate", "rate"),
  },
};

const arrange: Step = {
  id: "arrange",
  actions: [
    A.when(() => topKey(/^Arrange/)() === null, A.click(topKey(/^View options/), { label: "View options" })),
    A.click(topKey(/^Arrange/), { label: "Arrange" }),
    A.wait(1500),
    fit,
    A.wait(400),
  ],
  note: {
    text: "*Arrange* untangles the plan, and *Fit* brings all of it into view.",
    at: topKey(/^Arrange|^View options/),
  },
};

// endregion

// region The overview

const overview: Step = {
  id: "overview",
  actions: [A.wait(200)],
  note: {
    text: "The *overview* lists everything in the plan. You can set your inputs and outputs from here too.",
    at: railRoot,
  },
};

const colours: Step = {
  id: "colours",
  actions: [A.wait(200)],
  note: {
    text:
      "{b:Blue} is always something coming into your plan, and {o:Orange} is always something leaving it. Nothing else is shown in those colours.",
    at: around(railSection(/INPUTS/), railLine(/Iron Ingot/), railSection(/OUTPUTS/), railLine(/Iron Plate/)),
  },
};

const machinesStep: Step = {
  id: "machines",
  actions: [A.wait(200)],
  note: { text: "Your *machines* are here too: set how many from here, as on their cards.", at: railSection(/MACHINES/) },
};

// endregion

// region One machine for two recipes, undo, and how numbers show

const combine: Step = {
  id: "combine",
  actions: [
    A.click(cardPart(0, "picture"), { label: "first card" }),
    A.wait(150),
    A.withKey("Shift", [A.click(cardPart(1, "picture"), { mods: { shift: true }, label: "second card" })], { caps: ["Shift"] }),
    A.until(() => textOf("button, [role=button]", /^Combine\s*2/i)() !== null, "the Combine key", 2500),
    A.click(textOf("button, [role=button]", /^Combine\s*2/i), { label: "Combine" }),
    A.until(() => nodeCount() === 1, "the combined card", 3000),
    A.wait(300),
  ],
  note: {
    text: "Hold *Shift* to select more than one. Then you can *merge* machines, to run two recipes on one machine.",
    at: card(0),
  },
};

const undo: Step = {
  id: "undo",
  actions: [
    A.when(() => nodeCount() === 1, A.click(undoKey, { label: "Undo" })),
    A.until(() => nodeCount() === 2, "the undone merge", 3000),
    A.wait(300),
  ],
  note: { text: "*Undo* and *redo* are up here.", at: around(undoKey, redoKey) },
};

const units: Step = {
  id: "units",
  actions: [
    A.click(rateUnitKey, { label: "rate key" }),
    A.wait(150),
    A.click(rateUnitKey, { label: "rate key" }),
    A.wait(150),
    A.click(rateUnitKey, { label: "rate key" }),
    A.wait(150),
    A.click(rateUnitKey, { label: "rate key" }),
    A.wait(150),
    A.click(powerUnitKey, { label: "power key" }),
    A.wait(250),
    A.click(powerUnitKey, { label: "power key" }),
  ],
  note: { text: "These buttons change *the way numbers are shown*.", at: around(rateUnitKey, powerUnitKey) },
};

// endregion


// region Forced inputs and outputs

/** The bender, added the way step one added it (search, pick the item, add its recipe), on a clean board. */
const addBender: Action[] = [
  A.run(() => {
    store().clearResourceBrowser();
    store().setRecipeSearch("");
  }),
  A.type(itemsSearch, "iron plate", { label: "items search" }),
  A.until(() => itemTile("Iron Plate")() !== null, "Iron Plate in the list"),
  A.click(itemTile("Iron Plate"), { label: "Iron Plate" }),
  A.until(() => recipeOverlay() !== null, "recipe search"),
  A.until(() => addRecipe(BENDER)() !== null, "the bender's recipe", 20000),
  A.show(addRecipe(BENDER)),
  A.click(addRecipe(BENDER), { label: "add the bender's recipe" }),
  A.until(() => nodeCount() === 1, "the card"),
  A.until(solved, "the solve"),
  fit,
];

const forcedAdd: Step = {
  id: "forced-add",
  actions: [
    A.run(() => store().cleanBoard()),
    A.until(() => nodeCount() === 0, "the clean board"),
    ...addBender,
    A.click(within(portRow(0, "Input", "Iron Ingot"), ".cc-icon"), { label: "the ingots input" }),
    A.until(() => recipeOverlay() !== null, "what makes ingots", 20000),
    A.until(() => addRecipe(/./)() !== null, "a recipe that makes ingots", 20000),
    A.show(addRecipe(/./)),
    A.click(addRecipe(/./), { label: "add the maker" }),
    A.until(() => nodeCount() === 2, "the second card"),
    A.until(solved, "the solve"),
    A.click(fitKey),
    A.wait(400),
  ],
  note: {
    text: "Click an input to find *what makes it*. A recipe added from there comes in *already wired*.",
    at: card(1),
  },
};

const forcedInput: Step = {
  id: "forced-input",
  actions: [
    A.type(cardPart(1, "count"), "1", { enter: true, label: "the maker's count" }),
    A.until(() => pinnedCount(1) === 1, "the maker's pin"),
    A.type(cardPart(0, "count"), "6", { enter: true, label: "the bender's count" }),
    A.until(() => pinnedCount(0) === 6, "the bender's pin"),
    A.until(solved, "the solve"),
    A.wait(400),
  ],
  note: {
    text: "One maker is pinned but the bender needs more ingots than it makes. The plan has to bring in the rest anyway: a *forced input*.",
    at: portRow(0, "Input", "Iron Ingot"),
  },
};

const forcedOutput: Step = {
  id: "forced-output",
  actions: [
    A.type(cardPart(0, "count"), "1", { enter: true, label: "the bender's count" }),
    A.until(() => pinnedCount(0) === 1, "the bender's pin"),
    A.type(cardPart(1, "count"), "6", { enter: true, label: "the maker's count" }),
    A.until(() => pinnedCount(1) === 6, "the maker's pin"),
    A.until(solved, "the solve"),
    A.wait(400),
  ],
  note: {
    text: "Now the maker makes more than the bender uses. The excess leaves the plan as a *forced output*.",
    at: card(1),
  },
};

// endregion

// region Products, trash and power

const trashStep: Step = {
  id: "trash",
  actions: [
    A.drag(portHandle(0, "Output", "Iron Plate"), rightOf(card(0), 130), { label: "the plates" }),
    A.until(() => drawerOf("Iron Plate")() !== null, "the plates drawer"),
    A.wait(300),
    fit,
    A.wait(400),
    A.click(drawerPart("Iron Plate", "rule"), { label: "the drawer's rule key" }),
    A.wait(400),
  ],
  note: {
    text: "This key's menu also makes a product drawer *trash*: it voids what comes in, and leaves your outputs.",
    at: drawerPart("Iron Plate", "rule"),
  },
};

const nonRecipe: Step = {
  id: "non-recipe",
  actions: [closeMenus, A.click(powerKey, { label: "Power" }), A.wait(500)],
  note: {
    text: "This section is for *non-recipe machines*, mostly power generation.",
    at: powerKey,
  },
};

// endregion

// region In the minimap and the rest of the chrome

const minimapStep: Step = {
  id: "minimap",
  actions: [
    A.run(() => setMinimap({ show: true, size: "small", shape: "square", corner: "bottom-right", fit: true })),
    A.wait(300),
    A.key("]", { caps: ["]"] }),
    A.wait(150),
    A.key("]", { caps: ["]"] }),
    A.wait(200),
    A.key("[", { caps: ["["] }),
    A.key("[", { caps: ["["] }),
    A.wait(200),
    A.drag(() => { const m = document.querySelector("[data-minimap]"); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, () => { const m = document.querySelector("[data-minimap]"); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2 + 24, y: r.top + r.height / 2 + 12 }; }, { label: "the map" }),
    A.wait(300),
    fit,
  ],
  note: {
    text:
      "The *minimap* shows your whole plan. Drag on it to move the board, and scroll over it to zoom it. *[* and *]* zoom it too, and *N* hides it. Its gear sets its size and corner.",
    at: () => document.querySelector("[data-minimap]"),
  },
};

const seeThrough: Step = {
  id: "see-through",
  actions: [A.run(() => setSeeThrough(60)), A.wait(500)],
  note: {
    text: "*See-through* fades the board's paper and the overview, and leaves the cards and the words solid. It is in the settings.",
    at: railRoot,
  },
};


const stickyNote: Step = {
  id: "sticky-note",
  actions: [
    closeMenus,
    fit,
    A.right(boardSpot(0.16, 0.2), { label: "free board" }),
    A.click(textOf("button, [role=menuitem], [role=button], li", /^Add (a )?sticky note$/), { label: "Add sticky note" }),
    A.until(() => css(".sn")() !== null, "the note"),
    A.wait(300),
    A.type(css(".sn-area"), "Ingots come in from the left.", { keep: true, label: "the note's text" }),
    A.wait(300),
    A.click(boardSpot(0.5, 0.92), { label: "free board" }),
    A.wait(300),
  ],
  note: {
    text: "Annotations are possible with *sticky notes*. Right-click anywhere to make one.",
    at: css(".sn"),
  },
};

// region Your plans, plans together, task boards

const inviteKey: Target = barKey("invite");
const plansKey: Target = barKey("plans");

const inviteStep: Step = {
  id: "invite",
  actions: [closeMenus, A.wait(300)],
  note: {
    text: "Sign in and your plans save as you edit, on any computer and in the game. *Invite* someone and you build the plan together, live.",
    at: inviteKey,
  },
};

const plansStep: Step = {
  id: "plans",
  actions: [closeMenus, A.click(plansKey, { label: "Plans" }), A.wait(1000)],
  note: { text: "*Plans* has all your plans, and the ones people shared with you.", at: plansKey },
};

const noticeOpen: Target = textOf("button", /^Open$/, css("[data-live-notice]"));

const taskBoardStep: Step = {
  id: "task-board",
  actions: [
    closeMenus,
    A.click(cardPart(0, "menu"), { label: "card menu" }),
    A.click(menuRow(/^Add to a task/), { label: "Add to a task" }),
    A.click(menuRow(/^New task board/), { label: "New task board" }),
    A.until(() => noticeOpen() !== null, "the notice"),
    A.wait(400),
  ],
  note: {
    text: "*Add to a task* puts machines on a task board, with how many to build.",
    at: css("[data-live-notice] p"),
  },
};

const taskStep: Step = {
  id: "task",
  actions: [
    A.click(noticeOpen, { label: "Open" }),
    A.until(() => css('[aria-label="Task title"]')() !== null, "the task box"),
    A.wait(600),
  ],
  note: {
    text: "A *task* holds notes, a checklist, comments and who is on it. Drag it across the columns as the work goes.",
    at: css('[aria-label^="Task: "]'),
  },
};

// endregion

const libraryTab: Target = libraryKey;

const libraryStep: Step = {
  id: "library",
  actions: [A.click(libraryTab, { label: "Community" }), A.wait(1200)],
  note: { text: "*Community* is where people post their plans. You can browse them here.", at: libraryTab },
};

const newPlan: Step = {
  id: "new-plan",
  actions: [
    A.click(textOf("[data-design-id]", /^Tour plan/), { label: "the Tour plan tab" }),
    A.wait(600),
  ],
  note: {
    text: "Here's how you make a *new plan*.",
    at: css(".mt-plus"),
  },
};

const feedback: Step = {
  id: "feedback",
  actions: [closeMenus, A.run(() => setSeeThrough(0)), A.wait(200)],
  note: {
    text:
      "That's everything! Found a bug, or have an idea? *Feedback* sends it from here. Questions about your own setup do well in GTNH Planner's thread on the *GT New Horizons Discord*.",
    at: feedbackKey,
  },
};

// endregion

export const STEPS: Step[] = [
  findRecipe,
  firstCard,
  mouseAround,
  keysAround,
  pinNumber,
  pinCount,
  pinInput,
  tierStep,
  powerStep,
  settingsStep,
  cloneStep,
  drawerFromPort,
  drawerFromItems,
  wiring,
  arrange,
  overview,
  colours,
  machinesStep,
  combine,
  undo,
  units,
  forcedAdd,
  forcedInput,
  forcedOutput,
  trashStep,
  nonRecipe,
  minimapStep,
  seeThrough,
  stickyNote,
  ...(isLiveConfigured() ? [inviteStep] : []),
  plansStep,
  libraryStep,
  newPlan,
  ...(isLiveConfigured() ? [taskBoardStep, taskStep] : []),
  feedback,
];
