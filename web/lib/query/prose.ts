// Guards Claude-written prose in a stored brief (reasons, notes, gaps) against figures. Counts come from
// the database: the app shows the SQL share and n beside each item, so a percentage Claude restated in
// its prose is dropped here rather than shown next to (and possibly disagreeing with) the real number.

const FIGURE = /\d+(?:[.,]\d+)?\s*(?:%|percent\b)|\bn\s*=\s*\d/i;
const LEADING_CONJUNCTION = /^(?:but|and|so|yet|while|although|though|whereas)\s+/i;

/** Splits on commas, semicolons and dashes that are outside quotes and parentheses. */
function clauses(sentence: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < sentence.length; i++) {
    const ch = sentence[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === "“") quoted = true;
    else if (ch === "”") quoted = false;
    else if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (!quoted && depth === 0 && (ch === "," || ch === ";" || ch === "—" || ch === "–") && /\s/.test(sentence[i + 1] ?? "")) {
      out.push(sentence.slice(start, i));
      start = i + 1;
    }
  }
  out.push(sentence.slice(start));
  return out.map((c) => c.trim()).filter(Boolean);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The text with every clause that states a percentage (or an n=) removed. Sentences without figures
 * are kept as written; a sentence whose every clause has one is dropped. Returns "" when nothing is left.
 */
export function withoutFigures(text: string | null | undefined): string {
  if (!text) return "";
  if (!FIGURE.test(text)) return text.trim();
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (!FIGURE.test(sentence)) {
      if (sentence.trim()) kept.push(sentence.trim());
      continue;
    }
    const rest = clauses(sentence.replace(/[.!?]+$/, "")).filter((c) => !FIGURE.test(c));
    if (rest.length === 0) continue;
    const joined = rest.join(", ").replace(LEADING_CONJUNCTION, "");
    kept.push(`${capitalize(joined)}.`);
  }
  return kept.join(" ");
}
