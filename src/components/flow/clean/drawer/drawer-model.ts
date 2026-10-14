import type { FactoryStorage, StorageThroughputResult } from "@/lib/model/types";
import { formatCompact, formatPowerValue } from "@/lib/model";
import type { StorageRole } from "@/lib/model/storage-role";
import { storageTargetMode, type TargetMode } from "@/lib/model/storage-target";
import { rateMultiplierForKind, rateSuffixForKind } from "@/lib/model/rate-unit";
import { RULE_MARK, RULE_NAME, trimFlow } from "../../rate-rule";
import type { DrawerKind } from "../tokens";
import { measureText } from "../text-measure";

/**
 * The clean drawer as plain data: every string final, nothing measured from the DOM.
 * `CleanDrawer.tsx` only draws it. The kinds are the mod's (`Drawer.Kind`): a source, a product (a byproduct is a
 * product with no rule) and trash.
 */

/** The menu's last row for a product, and for trash: the mod's words (`DrawerCard.TO_TRASH`, `TO_PRODUCT`). */
export const TO_TRASH = "Void it (trash)";
export const TO_PRODUCT = "Keep it (product)";

/** The words column of the drawer: 76 px at the row's 14 px figure and 9 px name. */
const WORDS = 76;

/**
 * Whether the clean drawer draws this one: every drawer. A power drawer is the same source or product drawer with
 * EU in it (its picture the bolt in its amber box); a buffer, which the plan converts to plain wires, reads as the
 * product drawer it is wired like. The classic drawer is no longer reachable from the board.
 */
export function supportsCleanDrawer(
  _storage: Pick<FactoryStorage, "kind">,
  _role: StorageRole,
): boolean {
  void _storage;
  void _role;
  return true;
}

/** The mod's kind: trash is steel, a source blue, everything that leaves the plan orange. */
export function drawerKindFor(
  role: StorageRole,
  storage: Pick<FactoryStorage, "targetPerSecond">,
): DrawerKind {
  if (role === "source") return "source";
  if (role === "trash") return "trash";
  // An unwired drawer reads as the end it was made as (a negative goal is an input).
  if (role === "idle" && (storage.targetPerSecond ?? 0) < 0) return "source";
  return "product";
}

/** A rate in the board's unit as the drawer's own figure: `trimFlow` below a thousand, `k` and `M` above. */
export function formatRateField(perSecond: number, kind: string): string {
  const scaled = Math.abs(perSecond * rateMultiplierForKind(kind));
  if (kind === "power") return formatPowerValue(scaled);
  if (scaled >= 1_000_000) return `${trimFlow(scaled / 1_000_000)}M`;
  if (scaled >= 1_000) return `${trimFlow(scaled / 1_000)}k`;
  return scaled >= 1 ? trimFlow(scaled) : formatCompact(scaled);
}

/** What the plan moves through the drawer, as a figure and its unit (no sign). */
export function formatRateParts(perSecond: number, kind: string): { number: string; unit: string } {
  const scaled = Math.abs(perSecond * rateMultiplierForKind(kind));
  const unit = rateSuffixForKind(kind).trim();
  if (!Number.isFinite(scaled) || scaled < 0.000005) return { number: "0", unit };
  return { number: formatRateField(perSecond, kind), unit };
}

export type ProgressTone = "ok" | "bad" | "calm";

export interface CleanDrawerView {
  id: string;
  kind: DrawerKind;
  /** The resource's name. */
  label: string;
  number: string;
  unit: string;
  zero: boolean;
  numberSmall: boolean;
  nameSmall: boolean;
  nameClipped: boolean;
  /** A source or a product has a rule key and a rate box; trash a key and "Voided". */
  hasRule: boolean;
  /** The rule as shown: Any when no number applies. */
  rule: TargetMode;
  ruleMark: string;
  /** The rate box: the target as a figure, undefined on Any. */
  target?: { number: string; unit: string };
  /** The box's words when there is no target: Set, Set rate (pulsing) or Voided. */
  boxText: string;
  /** Nothing sets this part of the plan: the box asks for a rate. */
  prompt: boolean;
  /** The plan cannot reach the target. */
  unmet: boolean;
  /** What the plan reaches, as a figure with its unit (only when unmet). */
  reaches?: string;
  /** The share of the target in use, 0..1, when there is a target. */
  progress?: number;
  tone: ProgressTone;
  linked: boolean;
  /** The glance pill: a sign and a short figure. */
  glanceRate: string;
  tips: { bar: string; del: string; rule: string; rate: string; body: string };
}

export interface DrawerViewInput {
  storage: FactoryStorage;
  role: StorageRole;
  label: string;
  result: StorageThroughputResult | undefined;
  /** The plan's `unanchored` includes this drawer: nothing sets its part of the plan. */
  unanchored: boolean;
  /** The plan's `unmetDrawers` includes it. */
  unmet: boolean;
  linked: boolean;
}

const KIND_NAME: Record<DrawerKind, string> = {
  source: "Source",
  product: "Product",
  trash: "Trash",
};

function ruleMeaning(kind: DrawerKind, rule: TargetMode): string {
  const flow = kind === "source" ? "draws from it" : "puts in it";
  switch (rule) {
    case "ignore":
      return `No target: the plan ${flow} whatever it needs.`;
    case "at-least":
      return `The plan ${flow} at least the rate.`;
    case "exact":
      return `The plan ${flow} exactly the rate.`;
    case "at-most":
      return `The plan ${flow} no more than the rate.`;
  }
}

export function buildDrawerView(input: DrawerViewInput): CleanDrawerView {
  const { storage, role, label, result, unanchored, unmet, linked } = input;
  const kind = drawerKindFor(role, storage);
  const resourceKind = storage.kind;
  const net = Math.abs(result?.netPerSecond ?? 0);
  const { number, unit } = formatRateParts(net, resourceKind);
  const zero = !(net > 0.000005);
  const hasRule = kind !== "trash";
  const target = storage.targetPerSecond;
  // A byproduct is a product with no rule: whatever its stored rule, it reads as Any until it is made a product.
  const inert = role === "byproduct" || role === "trash";
  const mode = storageTargetMode(storage, role);
  const hasTarget =
    hasRule &&
    !inert &&
    target !== undefined &&
    mode !== "ignore" &&
    Number.isFinite(target) &&
    (target !== 0 || mode === "exact" || mode === "at-most");
  const rule: TargetMode = hasTarget ? mode : "ignore";
  const targetParts = hasTarget
    ? {
        number: formatRateField(target!, resourceKind),
        unit: rateSuffixForKind(resourceKind).trim(),
      }
    : undefined;
  const unitLabel = rateSuffixForKind(resourceKind).trim();
  const prompt = hasRule && !hasTarget && unanchored;
  const share =
    hasTarget && Math.abs(target!) > 0 ? Math.min(1, net / Math.abs(target!)) : undefined;
  const isUnmet = hasTarget && (unmet || result?.targetUnreachable === true);
  const tone: ProgressTone = isUnmet ? "bad" : rule === "at-most" ? "calm" : "ok";
  const sign = zero ? "" : kind === "source" ? "-" : "+";
  const reaches = isUnmet ? `${formatRateField(net, resourceKind)} ${unitLabel}` : undefined;
  const flowWord = kind === "source" ? "Supplies" : "Takes";

  const ruleTip =
    kind === "trash"
      ? "Trash\nIt voids what comes in: it leaves the plan without being one of its outputs.\nClick: Keep it instead"
      : `Rule: ${RULE_MARK[rule]} ${RULE_NAME[rule]}\n${ruleMeaning(kind, rule)}\nClick: Pick. Wheel: Next. Middle click: Clear`;
  const rateTip = [
    hasTarget ? "Target rate" : "No rate yet",
    hasTarget ? `${RULE_NAME[rule]}: ${targetParts!.number} ${unitLabel}` : "",
    isUnmet ? `Reaches: ${reaches}` : "",
    "Click: Type (2.5k, 1/3). Wheel: +1, Ctrl 10, Shift 100. Middle click: Clear",
  ]
    .filter(Boolean)
    .join("\n");
  const bodyTip = [
    label,
    KIND_NAME[kind],
    `${flowWord}: ${number} ${unitLabel}`,
    linked ? "" : "Unconnected",
    isUnmet && hasTarget
      ? `Reaches only ${reaches} of its ${targetParts!.number} ${unitLabel} target`
      : "",
    "Drag: Wire to a card. Keys: R, U",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: storage.id,
    kind,
    label,
    number,
    unit,
    zero,
    numberSmall: measureText(number, 14, 600) + 2 + measureText(unit, 9, 500) > WORDS,
    nameSmall: measureText(label, 9, 500) > WORDS,
    nameClipped: measureText(label, 7.5, 500) > WORDS,
    hasRule,
    rule,
    ruleMark: kind === "trash" ? "×" : RULE_MARK[rule],
    target: targetParts,
    boxText: kind === "trash" ? "Voided" : prompt ? "Set rate" : "Set",
    prompt,
    unmet: isUnmet,
    reaches,
    progress: share,
    tone,
    linked,
    glanceRate: `${sign}${number}`,
    tips: {
      bar: `${label}\n${KIND_NAME[kind]}\nDrag: Move. Click: Select`,
      del: "Delete this drawer",
      rule: ruleTip,
      rate: rateTip,
      body: bodyTip,
    },
  };
}
