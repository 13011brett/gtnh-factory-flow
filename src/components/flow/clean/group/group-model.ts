import {
  BOARD_GRID,
  RECIPE_NODE_WIDTH,
  STORAGE_NODE_HEIGHT,
  STORAGE_NODE_WIDTH,
  snapSizeUpToGrid,
} from "@/lib/board-grid";
import { paperForBoardId } from "@/lib/model/board-paper";
import type { FactoryNodeColorTag, FactoryPocket, FactoryProject } from "@/lib/model/types";
import { GT_NODE_COLORS } from "../../node-colors";
import { mixHex } from "../colors";
import { CC } from "../tokens";

/**
 * Groups (docs/groups.md): the website's boards (`FactoryPocket`, unchanged) in the clean card's look on plan
 * boards. Everything here is pure: colours, names, the chrome's sizes, and the edits that make, fill, empty and fit
 * a group. The store applies the edits as one undo step each.
 *
 * Coordinates: a member's stored position is relative to its group's frame corner, a group's to its parent's;
 * the frame's top `GROUP.strip` is kept clear for the title strip. Frames follow the mod's rules (`FRAME`), so a
 * group edited on either side keeps the same frame: members' box plus 10 px, the strip above, never snapped.
 */

/**
 * The chrome in board px, the mod's sizes one to one: the board places and sizes cards, drawers, notes and groups
 * as the mod does, so a plan looks the same in both.
 */
export const GROUP = {
  /** Title strip height. */
  strip: 20,
  /** The collapse key's side, and how far in from the strip's right end. */
  key: 14,
  keyInset: 3,
  /** Where the strip's and the summary's text starts. */
  textInset: 6,
  /** The summary's "N machines" line. */
  line: 14,
  /** A summary row. */
  row: 20,
  icon: 16,
  /** Under the summary's last row. */
  pad: 4,
  /** The resize band, either side of the border. */
  grip: 4,
  /** The summary card is a card's width. */
  width: RECIPE_NODE_WIDTH,
} as const;

/** A frame's padding round its members and its smallest size: the mod's `BoardGroup.PAD`, `MIN_W`, `MIN_H`. */
export const FRAME = {
  pad: 10,
  minWidth: 160,
  minHeight: 80,
  /** The mod's board grid, which a new group's corner sits on (`BoardSession.snap`). */
  grid: 10,
} as const;

/** A pocket's paper to its colour tag (a pocket with no `colorTag`). */
export const THEME_TAG: Readonly<Record<string, FactoryNodeColorTag>> = {
  slate: "steel",
  blueprint: "azure",
  chalkboard: "green",
  graphite: "brown",
  gunmetal: "light_gray",
  midnight: "blue",
  charcoal: "onyx",
  void: "black",
  parchment: "amber",
  paper: "white",
};

/** The colours a new group takes, the first nobody on the plan wears. */
export const NEW_GROUP_COLORS: readonly FactoryNodeColorTag[] = [
  "light_blue",
  "lime",
  "orange",
  "magenta",
  "yellow",
  "cyan",
  "pink",
  "purple",
  "scarlet",
  "emerald",
  "azure",
  "amber",
];

/** The tag a group wears: its own, else its paper's, else the paper its id gives it. */
export function groupColorTag(pocket: Pick<FactoryPocket, "id" | "colorTag" | "theme">): FactoryNodeColorTag {
  if (pocket.colorTag && GT_NODE_COLORS[pocket.colorTag]) return pocket.colorTag;
  return THEME_TAG[pocket.theme ?? ""] ?? THEME_TAG[paperForBoardId(pocket.id)]!;
}

export interface GroupColors {
  /** The group colour `C`. */
  c: string;
  /** The open body: `C` at 0x14. */
  body: string;
  /** Border and the rule under the strip: mix(canvas, C, 0.6). */
  border: string;
  /** The title strip: mix(C, surface, 0.3). */
  strip: string;
  /** Minimap: an open group's fill (`C` at 25%) and a collapsed one's box. */
  mapFill: string;
  mapCollapsed: string;
}

export function groupColors(tag: FactoryNodeColorTag): GroupColors {
  const c = (GT_NODE_COLORS[tag] ?? GT_NODE_COLORS.light_blue).swatch.toUpperCase();
  const strip = mixHex(c, CC.surface, 0.3);
  return {
    c,
    body: `${c}14`,
    border: mixHex(CC.canvas, c, 0.6),
    strip,
    mapFill: `${c}40`,
    mapCollapsed: strip,
  };
}

/** "Group N": N is the groups on the plan plus one. */
export function nextGroupName(pockets: readonly FactoryPocket[]): string {
  return `Group ${pockets.length + 1}`;
}

/** The first new-group colour no group wears (the first again when all are worn). */
export function nextGroupColor(pockets: readonly FactoryPocket[]): FactoryNodeColorTag {
  const worn = new Set(pockets.map((pocket) => groupColorTag(pocket)));
  return NEW_GROUP_COLORS.find((tag) => !worn.has(tag)) ?? NEW_GROUP_COLORS[0]!;
}

/** "N machines", "1 machine"; empty at 0. */
export function machinesText(count: number): string {
  if (!(count > 0)) return "";
  return count === 1 ? "1 machine" : `${count} machines`;
}

/**
 * The summary card's height for its rows (one row at least: the "Nothing goes in or out." line), up to the mod's
 * 10 px grid as its `GroupPaint.summaryHeight`.
 */
export function summaryHeight(rows: number): number {
  const h = GROUP.strip + GROUP.line + Math.max(1, rows) * GROUP.row + GROUP.pad;
  return Math.ceil(h / FRAME.grid) * FRAME.grid;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Size {
  x: number;
  y: number;
}

/** A thing's size: what the board measured, else an estimate. */
export type SizeOf = (id: string) => Size | undefined;

type Placed = { id: string; position: { x: number; y: number }; pocketId?: string };

/** Where a level's (a group's frame, or the board's) corner is on the board. */
export function levelOrigin(pockets: readonly FactoryPocket[], levelId: string | undefined): { x: number; y: number } {
  const byId = new Map(pockets.map((pocket) => [pocket.id, pocket]));
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  for (let id = levelId; id !== undefined && !seen.has(id); ) {
    seen.add(id);
    const pocket = byId.get(id);
    if (!pocket) break;
    // A legacy pocket that never stood open keeps its members in their own space.
    if (pocket.size !== undefined) {
      x += pocket.position.x;
      y += pocket.position.y;
    }
    id = pocket.parentPocketId;
  }
  return { x, y };
}

function sizeOfPocket(pocket: FactoryPocket, sizeOf: SizeOf): Size {
  if (pocket.expanded && pocket.size) return pocket.size;
  const measured = sizeOf(pocket.id);
  return measured ? { width: measured.width, height: measured.height } : { width: GROUP.width, height: summaryHeight(1) };
}

function estimate(project: FactoryProject, id: string, sizeOf: SizeOf): Size {
  const measured = sizeOf(id);
  // Only the size: the board publishes a whole box (with its corner on the board), and callers place it themselves.
  if (measured && measured.width > 0 && measured.height > 0) return { width: measured.width, height: measured.height };
  if ((project.storages ?? []).some((entry) => entry.id === id)) {
    return { width: STORAGE_NODE_WIDTH, height: STORAGE_NODE_HEIGHT };
  }
  const annotation = (project.annotations ?? []).find((entry) => entry.id === id);
  if (annotation) return { width: Math.max(1, annotation.size.width), height: Math.max(1, annotation.size.height) };
  return { width: RECIPE_NODE_WIDTH, height: BOARD_GRID * 14 };
}

/** The ids of a group's ancestors, nearest first. */
export function ancestorsOf(pockets: readonly FactoryPocket[], pocketId: string | undefined): string[] {
  const byId = new Map(pockets.map((pocket) => [pocket.id, pocket]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (let id = pocketId; id !== undefined && !seen.has(id); id = byId.get(id)?.parentPocketId) {
    if (!byId.has(id)) break;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function depthOf(pockets: readonly FactoryPocket[], pocketId: string): number {
  return ancestorsOf(pockets, pocketId).length;
}

/**
 * Grow open groups to hold their members' boxes plus a cell (and the title strip). Never shrinks. `only` limits it to
 * those groups and their ancestors (an edit fits what it touched, never an untouched old board). Deepest first, so an
 * inner group's growth reaches its parent.
 */
export function fitGroups(project: FactoryProject, sizeOf: SizeOf, only?: Iterable<string>): FactoryProject {
  let pockets = project.pockets ?? [];
  if (pockets.length === 0) return project;
  let wanted: Set<string> | undefined;
  if (only) {
    wanted = new Set<string>();
    for (const id of only) for (const up of ancestorsOf(pockets, id)) wanted.add(up);
    if (wanted.size === 0) return project;
  }
  const order = pockets
    .filter((pocket) => pocket.expanded && pocket.size && (!wanted || wanted.has(pocket.id)))
    .sort((a, b) => depthOf(pockets, b.id) - depthOf(pockets, a.id))
    .map((pocket) => pocket.id);
  let nodes = project.nodes;
  let storages = project.storages;
  let annotations = project.annotations;
  let changed = false;
  for (const id of order) {
    const pocket = pockets.find((entry) => entry.id === id)!;
    const size = pocket.size!;
    const boxes: Rect[] = [];
    const take = (items: readonly Placed[] | undefined) => {
      for (const item of items ?? []) {
        if (item.pocketId !== id) continue;
        boxes.push({ ...item.position, ...estimate(project, item.id, sizeOf) });
      }
    };
    take(nodes);
    take(storages);
    take(annotations);
    for (const child of pockets) {
      if (child.parentPocketId === id) boxes.push({ ...child.position, ...sizeOfPocket(child, sizeOf) });
    }
    if (boxes.length === 0) continue;
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    // The mod's Groups.fit: the members' box plus FRAME.pad, the strip above, to the pixel (whole pixels up).
    const dx = minX < FRAME.pad ? Math.ceil(FRAME.pad - minX) : 0;
    const top = GROUP.strip + FRAME.pad;
    const dy = minY < top ? Math.ceil(top - minY) : 0;
    const width = Math.max(size.width + dx, Math.ceil(maxX + dx + FRAME.pad), FRAME.minWidth);
    const height = Math.max(size.height + dy, Math.ceil(maxY + dy + FRAME.pad), FRAME.minHeight);
    if (dx === 0 && dy === 0 && width === size.width && height === size.height) continue;
    changed = true;
    const shift = <T extends Placed>(items: T[] | undefined): T[] | undefined =>
      items && (dx !== 0 || dy !== 0)
        ? items.map((item) =>
            item.pocketId === id ? { ...item, position: { x: item.position.x + dx, y: item.position.y + dy } } : item,
          )
        : items;
    nodes = shift(nodes)!;
    storages = shift(storages);
    annotations = shift(annotations);
    pockets = pockets.map((entry) => {
      if (entry.id === id) {
        return { ...entry, position: { x: entry.position.x - dx, y: entry.position.y - dy }, size: { width, height } };
      }
      if (entry.parentPocketId === id && (dx !== 0 || dy !== 0)) {
        return { ...entry, position: { x: entry.position.x + dx, y: entry.position.y + dy } };
      }
      return entry;
    });
  }
  return changed ? { ...project, nodes, storages, annotations, pockets } : project;
}

/** Where a thing sits and what holds it: an item, or a group (by its parent). */
function ownerOf(project: FactoryProject, id: string): { found: boolean; owner: string | undefined; group: boolean } {
  for (const list of [project.nodes, project.storages ?? [], project.annotations ?? []] as Placed[][]) {
    const item = list.find((entry) => entry.id === id);
    if (item) return { found: true, owner: item.pocketId, group: false };
  }
  const pocket = (project.pockets ?? []).find((entry) => entry.id === id);
  if (pocket) return { found: true, owner: pocket.parentPocketId, group: true };
  return { found: false, owner: undefined, group: false };
}

/** A thing's box on the board. */
function absoluteRect(project: FactoryProject, id: string, sizeOf: SizeOf): Rect | undefined {
  const pockets = project.pockets ?? [];
  const pocket = pockets.find((entry) => entry.id === id);
  if (pocket) {
    const origin = levelOrigin(pockets, pocket.parentPocketId);
    return { x: pocket.position.x + origin.x, y: pocket.position.y + origin.y, ...sizeOfPocket(pocket, sizeOf) };
  }
  for (const list of [project.nodes, project.storages ?? [], project.annotations ?? []] as Placed[][]) {
    const item = list.find((entry) => entry.id === id);
    if (item) {
      const origin = levelOrigin(pockets, item.pocketId);
      return { x: item.position.x + origin.x, y: item.position.y + origin.y, ...estimate(project, id, sizeOf) };
    }
  }
  return undefined;
}

/** Re-home things to a level, keeping where they stand on the board. */
function rehome(
  project: FactoryProject,
  targets: ReadonlyMap<string, { level: string | undefined; at: { x: number; y: number } }>,
): FactoryProject {
  const pockets0 = project.pockets ?? [];
  const relative = (level: string | undefined, at: { x: number; y: number }, pockets: readonly FactoryPocket[]) => {
    const origin = levelOrigin(pockets, level);
    return { x: at.x - origin.x, y: at.y - origin.y };
  };
  // Groups first (their new parents' origins must be known), in a fixed order; a group's own move never shifts its
  // members (theirs are relative to it).
  let pockets = pockets0.map((pocket) => {
    const target = targets.get(pocket.id);
    return target ? { ...pocket, parentPocketId: target.level } : pocket;
  });
  pockets = pockets.map((pocket) => {
    const target = targets.get(pocket.id);
    return target ? { ...pocket, position: relative(target.level, target.at, pockets) } : pocket;
  });
  const move = <T extends Placed>(items: T[] | undefined): T[] | undefined =>
    items?.map((item) => {
      const target = targets.get(item.id);
      return target ? { ...item, pocketId: target.level, position: relative(target.level, target.at, pockets) } : item;
    });
  return {
    ...project,
    nodes: move(project.nodes)!,
    storages: move(project.storages),
    annotations: move(project.annotations),
    pockets,
  };
}

/**
 * Make a group round the selection where it stands (nothing moves). Things carried by a selected group stay in it.
 * Everything selected in one group: the new group goes inside it; otherwise the selected things leave their groups
 * and the new group sits on the board. Selected groups go inside the new group.
 */
export function groupItems(
  project: FactoryProject,
  ids: readonly string[],
  sizeOf: SizeOf,
  newId: string,
): { project: FactoryProject; groupId: string } | undefined {
  const pockets = project.pockets ?? [];
  const chosen = new Set(ids);
  const things = [...chosen].filter((id) => {
    const where = ownerOf(project, id);
    if (!where.found) return false;
    // Riding along with a selected group: it keeps its place inside it.
    return !ancestorsOf(pockets, where.owner).some((up) => chosen.has(up));
  });
  if (things.length === 0) return undefined;
  const owners = new Set(things.map((id) => ownerOf(project, id).owner));
  const parent = owners.size === 1 ? [...owners][0] : undefined;
  const rects = things.map((id) => absoluteRect(project, id, sizeOf)!).filter(Boolean);
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  // The mod's GroupEdits.group: the corner on its 10 px grid, the box plus the padding and the strip.
  const corner = {
    x: Math.round((minX - FRAME.pad - 4) / FRAME.grid) * FRAME.grid,
    y: Math.round((minY - FRAME.pad - GROUP.strip - 4) / FRAME.grid) * FRAME.grid,
  };
  const parentOrigin = levelOrigin(pockets, parent);
  const group: FactoryPocket = {
    id: newId,
    name: nextGroupName(pockets),
    colorTag: nextGroupColor(pockets),
    ...(parent !== undefined ? { parentPocketId: parent } : {}),
    position: { x: corner.x - parentOrigin.x, y: corner.y - parentOrigin.y },
    expanded: true,
    size: {
      width: Math.max(FRAME.minWidth, Math.ceil(maxX - corner.x + FRAME.pad)),
      height: Math.max(FRAME.minHeight, Math.ceil(maxY - corner.y + FRAME.pad)),
    },
  };
  const targets = new Map(
    things.map((id, index) => [id, { level: newId as string | undefined, at: { x: rects[index]!.x, y: rects[index]!.y } }]),
  );
  const withGroup = { ...project, pockets: [...pockets, group] };
  const placed = rehome(withGroup, targets);
  return { project: fitGroups(placed, sizeOf, [newId, ...owners].filter((id): id is string => id !== undefined)), groupId: newId };
}

/** Is `id` (an item or group) something that can join `groupId`: not the group, not one of its ancestors. */
export function canJoin(project: FactoryProject, id: string, groupId: string): boolean {
  if (id === groupId) return false;
  return !ancestorsOf(project.pockets ?? [], groupId).includes(id);
}

/**
 * Put things in an open group: they move to sit just under its members, a cell in, side by side a cell apart, and
 * the frame grows.
 */
export function addToGroup(
  project: FactoryProject,
  ids: readonly string[],
  groupId: string,
  sizeOf: SizeOf,
): FactoryProject {
  const pockets = project.pockets ?? [];
  const group = pockets.find((pocket) => pocket.id === groupId);
  if (!group) return project;
  const moving = ids.filter((id) => ownerOf(project, id).found && canJoin(project, id, groupId));
  if (moving.length === 0) return project;
  const leaving = new Set(moving);
  let bottom: number = GROUP.strip;
  const consider = (items: readonly Placed[] | undefined) => {
    for (const item of items ?? []) {
      if (item.pocketId !== groupId || leaving.has(item.id)) continue;
      bottom = Math.max(bottom, item.position.y + estimate(project, item.id, sizeOf).height);
    }
  };
  consider(project.nodes);
  consider(project.storages);
  consider(project.annotations);
  for (const child of pockets) {
    if (child.parentPocketId === groupId && !leaving.has(child.id)) {
      bottom = Math.max(bottom, child.position.y + sizeOfPocket(child, sizeOf).height);
    }
  }
  const origin = levelOrigin(pockets, groupId);
  let x: number = FRAME.pad;
  const y = Math.ceil(bottom + FRAME.pad);
  const targets = new Map<string, { level: string | undefined; at: { x: number; y: number } }>();
  const owners = new Set<string>();
  for (const id of moving) {
    const rect = absoluteRect(project, id, sizeOf)!;
    targets.set(id, { level: groupId, at: { x: origin.x + x, y: origin.y + y } });
    const was = ownerOf(project, id).owner;
    if (was !== undefined) owners.add(was);
    x += snapSizeUpToGrid(rect.width) + BOARD_GRID;
  }
  return fitGroups(rehome(project, targets), sizeOf, [groupId, ...owners]);
}

/** Take a thing out of its group: it moves a cell clear of the frame's right side, into the group the frame sat in. */
export function removeFromGroup(project: FactoryProject, id: string, sizeOf: SizeOf): FactoryProject {
  const pockets = project.pockets ?? [];
  const where = ownerOf(project, id);
  if (!where.found || where.owner === undefined) return project;
  const group = pockets.find((pocket) => pocket.id === where.owner);
  if (!group) return project;
  const frame = absoluteRect(project, group.id, sizeOf)!;
  const rect = absoluteRect(project, id, sizeOf)!;
  const at = { x: frame.x + frame.width + BOARD_GRID, y: rect.y };
  const placed = rehome(project, new Map([[id, { level: group.parentPocketId, at }]]));
  return group.parentPocketId !== undefined ? fitGroups(placed, sizeOf, [group.parentPocketId]) : placed;
}

/** The open groups a thing could be added to, by name. */
export function openGroupsFor(project: FactoryProject, id: string): FactoryPocket[] {
  const pockets = project.pockets ?? [];
  const owner = ownerOf(project, id).owner;
  // Open and in view: every group above it open too.
  const shown = (pocket: FactoryPocket) => ancestorsOf(pockets, pocket.id).every((up) => pockets.find((p) => p.id === up)?.expanded);
  return pockets
    .filter((pocket) => pocket.id !== owner && shown(pocket) && canJoin(project, id, pocket.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The group a thing is in, if any. */
export function groupOf(project: FactoryProject, id: string): string | undefined {
  return ownerOf(project, id).owner;
}
