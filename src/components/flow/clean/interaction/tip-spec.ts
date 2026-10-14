/**
 * A rich tip as plain data (the mod's `Tip`): a title, a muted line, rows of
 * label and value, notes, and action lines with a mouse icon. Elements carry
 * it as a `data-tip` attribute, so a card costs no extra DOM and one portal
 * panel (`TipHost`) draws whichever the pointer has rested on.
 */
export type TipTone = "plain" | "muted" | "warn" | "red";
export type TipInput = "left" | "right" | "wheel" | "middle" | "drag" | "key";

export interface TipSpec {
  /** The thing's identity, `${nodeId}|${part}[|${index}]`: moving about on it keeps the wait. */
  id: string;
  title: string;
  /** Grey line under the title. */
  sub?: string;
  rows?: Array<{ label: string; value: string; tone?: TipTone }>;
  /** Body lines. Words between asterisks are drawn in gold. */
  notes?: Array<{ text: string; tone?: TipTone }>;
  actions?: Array<{ input: TipInput; label: string }>;
  /** A panel the host renders from the store instead of rows (the power input panel). */
  panel?: { kind: "power"; nodeId: string };
}

export interface TipAttrs {
  "data-tip": string;
  "data-tip-id": string;
}

export function tipAttrs(spec: TipSpec): TipAttrs {
  return { "data-tip": JSON.stringify(spec), "data-tip-id": spec.id };
}

export function readTip(element: Element | null | undefined): TipSpec | undefined {
  const raw = element?.getAttribute("data-tip");
  if (!raw) return undefined;
  try {
    const spec = JSON.parse(raw) as TipSpec;
    return typeof spec.title === "string" && typeof spec.id === "string" ? spec : undefined;
  } catch {
    return undefined;
  }
}

/** Splits `say *this* word` into plain and gold runs (the mod's `say()`). */
export function splitGold(text: string): Array<{ text: string; gold: boolean }> {
  const parts = text.split("*");
  const out: Array<{ text: string; gold: boolean }> = [];
  parts.forEach((part, index) => {
    if (part !== "") out.push({ text: part, gold: index % 2 === 1 });
  });
  return out;
}
