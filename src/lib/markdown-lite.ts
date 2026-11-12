/**
 * A small markdown reader for the contest's legal texts
 * (content/concurs/*.md). Pure, no dependency: the texts use a handful of
 * constructs and the lawyer's edits arrive as a file swap, so the parser
 * covers exactly these and renders everything else as plain paragraphs
 * rather than guessing.
 *
 *   --- front matter ---     key: value lines (titlu, actualizat)
 *   ## / ### headings
 *   paragraphs               a leading "4.2." clause number is kept apart
 *   a) b) c) lines           a lettered list, letters preserved as written
 *   - items                  a plain list
 *   | tables |               with "---:" right alignment
 *   **bold**, [text](url)    the only inline marks
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: 2 | 3; text: string; id: string }
  | { kind: "paragraph"; number: string | null; content: Inline[] }
  | { kind: "letters"; items: { letter: string; content: Inline[] }[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "table"; head: Inline[][]; align: ("left" | "right")[]; rows: Inline[][][] };

export interface MarkdownDoc {
  meta: Record<string, string>;
  blocks: Block[];
  /** The level-2 headings, for the table of contents. */
  toc: { id: string; text: string }[];
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/**
 * "9^1" -> "9¹": an article inserted between two others is numbered with a
 * raised index in Romanian legal drafting ("art. 9¹"); the drafts type it
 * with a caret. Same number, set the way it is read.
 */
export function raiseIndex(text: string): string {
  return text.replace(/(\d)\^(\d+)/g, (_, base: string, index: string) =>
    base + [...index].map((digit) => SUPERSCRIPT[Number(digit)]).join(""),
  );
}

/** "Articolul 2. Denumirea, perioada" -> "articolul-2-denumirea-perioada". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function parseInline(raw: string): Inline[] {
  const source = raiseIndex(raw);
  const out: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > last) out.push({ kind: "text", text: source.slice(last, match.index) });
    if (match[1] !== undefined) {
      out.push({ kind: "bold", children: parseInline(match[1]) });
    } else {
      out.push({ kind: "link", href: match[3], children: parseInline(match[2]) });
    }
    last = match.index + match[0].length;
  }
  if (last < source.length) out.push({ kind: "text", text: source.slice(last) });
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

export function parseMarkdown(source: string): MarkdownDoc {
  const meta: Record<string, string> = {};
  let body = source.replace(/\r\n/g, "\n");
  const front = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (front) {
    for (const line of front[1].split("\n")) {
      const at = line.indexOf(":");
      if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    body = body.slice(front[0].length);
  }

  const lines = body.split("\n");
  const blocks: Block[] = [];
  const used = new Set<string>();
  let i = 0;

  const isLetter = (line: string) => /^[a-z]\)\s+\S/.test(line);
  const isItem = (line: string) => /^-\s+\S/.test(line);
  const isTable = (line: string) => line.trim().startsWith("|");
  const isHeading = (line: string) => /^#{2,3}\s+\S/.test(line);
  const isRule = (line: string) => /^-{3,}\s*$/.test(line);
  const startsBlock = (line: string) =>
    isLetter(line) || isItem(line) || isTable(line) || isHeading(line) || isRule(line);

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || isRule(line)) {
      i += 1;
      continue;
    }

    if (isHeading(line)) {
      const level = line.startsWith("###") ? 3 : 2;
      const written = line.replace(/^#{2,3}\s+/, "").trim();
      const text = raiseIndex(written);
      // The anchor comes from the typed form: "9^1" -> "articolul-9-1-...".
      let id = slugify(written) || `sectiune-${blocks.length}`;
      while (used.has(id)) id += "-2";
      used.add(id);
      blocks.push({ kind: "heading", level, text, id });
      i += 1;
      continue;
    }

    if (isTable(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTable(lines[i])) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      const divider = rows[1]?.every((cell) => /^:?-{3,}:?$/.test(cell)) ? rows[1] : null;
      const head = rows[0];
      blocks.push({
        kind: "table",
        head: head.map(parseInline),
        align: head.map((_, col) => (divider?.[col]?.endsWith(":") ? "right" : "left")),
        rows: rows.slice(divider ? 2 : 1).map((row) => row.map(parseInline)),
      });
      continue;
    }

    if (isLetter(line)) {
      const items: { letter: string; content: Inline[] }[] = [];
      while (i < lines.length && isLetter(lines[i])) {
        items.push({ letter: lines[i][0], content: parseInline(lines[i].slice(2).trim()) });
        i += 1;
      }
      blocks.push({ kind: "letters", items });
      continue;
    }

    if (isItem(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && isItem(lines[i])) {
        items.push(parseInline(lines[i].replace(/^-\s+/, "").trim()));
        i += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }

    // A paragraph: lines up to a blank one or to the start of another block.
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i])) {
      parts.push(lines[i].trim());
      i += 1;
    }
    const text = parts.join(" ");
    // "4.2." and, for an inserted article, "9^1.4."
    const clause = text.match(/^(\d+(?:\^\d+)?\.\d+\.)\s+/);
    blocks.push({
      kind: "paragraph",
      number: clause ? raiseIndex(clause[1]) : null,
      content: parseInline(clause ? text.slice(clause[0].length) : text),
    });
  }

  return {
    meta,
    blocks,
    toc: blocks.flatMap((block) =>
      block.kind === "heading" && block.level === 2 ? [{ id: block.id, text: block.text }] : [],
    ),
  };
}

/** "2026-11-10" -> "10.11.2026" (Romanian date order); null when it is not a date. */
export function romanianDate(iso: string | undefined): string | null {
  const match = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : null;
}
