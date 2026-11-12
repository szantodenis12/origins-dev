import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseMarkdown, romanianDate, type MarkdownDoc } from "./markdown-lite";

/**
 * The contest's two legal texts, read from markdown in the repo:
 *
 *   content/concurs/regulament.md         the contest rules
 *   content/concurs/confidentialitate.md  the contest privacy note
 *
 * They are NOT the Origins Circle rules or the app's privacy page
 * (src/app/regulament, src/app/confidentialitate): those belong to the
 * loyalty programme and stay where they are.
 *
 * A lawyer's revision is a file swap: replace the .md, keep the two
 * front-matter lines (`titlu`, `actualizat: YYYY-MM-DD`), deploy. The files
 * are read per request, so nothing else needs rebuilding in development;
 * next.config.ts lists them for the production file trace.
 */

export type ContestDocName = "regulament" | "confidentialitate";

export interface ContestDoc extends MarkdownDoc {
  title: string;
  /** "10.11.2026", from the file's own `actualizat` line; null if it has none. */
  updated: string | null;
}

export async function loadContestDoc(name: ContestDocName): Promise<ContestDoc> {
  const file = path.join(process.cwd(), "content", "concurs", `${name}.md`);
  const doc = parseMarkdown(await readFile(file, "utf8"));
  return {
    ...doc,
    title: doc.meta.titlu || (name === "regulament" ? "Regulamentul concursului de desene" : "Cum folosim datele"),
    updated: romanianDate(doc.meta.actualizat),
  };
}
