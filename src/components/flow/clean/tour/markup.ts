/**
 * The tour's text markup, as the mod's Script writes it: words between asterisks are gold (the words that matter
 * most), {b:Blue} the inputs' blue, {o:Orange} the outputs' orange. A line that starts with {M}, {W} or {L}
 * (a note that points at nothing) has a small mouse in a column of its own: middle button, wheel, left button.
 */

export type Ink = "plain" | "gold" | "blue" | "orange";
export interface Span {
  text: string;
  ink: Ink;
}
export type Glyph = "M" | "W" | "L" | "R" | "K";
export interface Line {
  glyph?: Glyph;
  spans: Span[];
}

export function parseSpans(source: string): Span[] {
  const spans: Span[] = [];
  const re = /\*([^*]+)\*|\{([bo]):([^}]+)\}/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (match.index > last) spans.push({ text: source.slice(last, match.index), ink: "plain" });
    if (match[1] !== undefined) spans.push({ text: match[1], ink: "gold" });
    else spans.push({ text: match[3]!, ink: match[2] === "b" ? "blue" : "orange" });
    last = match.index + match[0].length;
  }
  if (last < source.length) spans.push({ text: source.slice(last), ink: "plain" });
  return spans;
}

/** The note's lines: split on new lines, a leading {M}, {W}, {L} or {R} lifted out as the line's mouse. */
export function parseLines(source: string): Line[] {
  return source.split("\n").map((raw) => {
    const m = /^\{([MWLRK])\}\s*/.exec(raw);
    return { glyph: m ? (m[1] as Glyph) : undefined, spans: parseSpans(m ? raw.slice(m[0].length) : raw) };
  });
}

/** The words with the markup taken out, for labels and tests. */
export function plainText(source: string): string {
  return parseLines(source)
    .map((l) => l.spans.map((s) => s.text).join(""))
    .join("\n");
}
