import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The contest's legal texts: the small markdown reader, and the two files
// themselves (content/concurs/*.md), which must be publishable as they are.
import { parseInline, parseMarkdown, romanianDate, slugify } from "../src/lib/markdown-lite.ts";

const read = (name) => readFile(new URL(`../content/concurs/${name}.md`, import.meta.url), "utf8");

test("front matter, headings and the table of contents", () => {
  const doc = parseMarkdown(
    "---\ntitlu: Un titlu\nactualizat: 2026-11-10\n---\n\n## Articolul 1. Organizatorul\n\n1.1. Text.\n\n### Sub\n\n## Articolul 2. Denumirea, perioada și locul\n",
  );
  assert.deepEqual(doc.meta, { titlu: "Un titlu", actualizat: "2026-11-10" });
  assert.deepEqual(doc.toc, [
    { id: "articolul-1-organizatorul", text: "Articolul 1. Organizatorul" },
    { id: "articolul-2-denumirea-perioada-si-locul", text: "Articolul 2. Denumirea, perioada și locul" },
  ]);
  assert.equal(doc.blocks.filter((b) => b.kind === "heading").length, 3);
  assert.equal(slugify("Întrebări și răspunsuri"), "intrebari-si-raspunsuri");
  assert.equal(romanianDate("2026-11-10"), "10.11.2026");
  assert.equal(romanianDate("ieri"), null);
  assert.equal(romanianDate(undefined), null);
});

test("clause numbers are kept apart; dates are not clause numbers", () => {
  const doc = parseMarkdown("4.2. Foaia oficială nu se descarcă.\n\n16.11.2026 este prima zi.\n\nText simplu\npe două rânduri.");
  assert.deepEqual(doc.blocks[0], {
    kind: "paragraph",
    number: "4.2.",
    content: [{ kind: "text", text: "Foaia oficială nu se descarcă." }],
  });
  assert.equal(doc.blocks[1].number, null);
  assert.deepEqual(doc.blocks[2].content, [{ kind: "text", text: "Text simplu pe două rânduri." }]);
});

test("an inserted article keeps its raised index: 9^1 reads 9¹", () => {
  const doc = parseMarkdown("## Articolul 9^1. Votul public\n\n9^1.4. Votantul, conform art. 9^1, votează.\n\n10.1. Altceva.");
  assert.equal(doc.blocks[0].text, "Articolul 9¹. Votul public");
  assert.equal(doc.blocks[0].id, "articolul-9-1-votul-public");
  assert.equal(doc.blocks[1].number, "9¹.4.");
  assert.deepEqual(doc.blocks[1].content, [{ kind: "text", text: "Votantul, conform art. 9¹, votează." }]);
  assert.equal(doc.blocks[2].number, "10.1.");
});

test("lettered lines are a list with their own letters, right under their clause", () => {
  const doc = parseMarkdown("5.2. **Pașii:**\n\na) primul;\nb) al doilea;\nf) al șaselea.\n\n5.3. Urmează.");
  assert.equal(doc.blocks[1].kind, "letters");
  assert.deepEqual(doc.blocks[1].items.map((item) => item.letter), ["a", "b", "f"]);
  assert.equal(doc.blocks[2].number, "5.3.");
  // A sentence that merely starts with a letter and a bracket elsewhere is prose.
  assert.equal(parseMarkdown("art. 6.1 lit. e) și restul").blocks[0].kind, "paragraph");
});

test("tables, alignment and plain lists", () => {
  const doc = parseMarkdown("| Categorie | Vârsta | Desene |\n|---|---|---:|\n| A | 3–5 ani | 3 |\n| **Total** | | **10** |\n\n- unu\n- **doi**\n");
  const table = doc.blocks[0];
  assert.equal(table.kind, "table");
  assert.deepEqual(table.align, ["left", "left", "right"]);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[1][1], []);
  assert.deepEqual(table.rows[1][2], [{ kind: "bold", children: [{ kind: "text", text: "10" }] }]);
  assert.equal(doc.blocks[1].kind, "list");
  assert.equal(doc.blocks[1].items.length, 2);
});

test("inline: bold and links only; anything else stays as written", () => {
  assert.deepEqual(parseInline("a **b** [c](/confidentialitate) d"), [
    { kind: "text", text: "a " },
    { kind: "bold", children: [{ kind: "text", text: "b" }] },
    { kind: "text", text: " " },
    { kind: "link", href: "/confidentialitate", children: [{ kind: "text", text: "c" }] },
    { kind: "text", text: " d" },
  ]);
  // No HTML is interpreted: it can only ever be shown as text.
  assert.deepEqual(parseInline("<script>x</script>"), [{ kind: "text", text: "<script>x</script>" }]);
});

for (const [name, firstHeading] of [
  ["regulament", /^Articolul 1\./],
  ["confidentialitate", /^1\. /],
]) {
  test(`content/concurs/${name}.md is publishable as it is`, async () => {
    const source = await read(name);
    const doc = parseMarkdown(source);

    // The two lines a file swap must keep.
    assert.ok(doc.meta.titlu?.length > 5, "titlu");
    assert.match(doc.meta.actualizat ?? "", /^\d{4}-\d{2}-\d{2}$/, "actualizat");
    // No campaign name in the page title.
    assert.ok(!/desenat de cei mici|Ediția I/.test(doc.meta.titlu), "plain title");

    // Nothing addressed to us survived the import.
    for (const internal of [
      "[avocat",
      "[de confirmat",
      "[contabil",
      "De confirmat",
      "Proiect. Necesită",
      ".md",
      "CLIENTI/",
      "nota pentru avocat",
      "Roland",
      "(document 0",
      "use-for:",
    ]) {
      assert.ok(!source.includes(internal), `${name}.md still contains ${JSON.stringify(internal)}`);
    }

    // No clause is left as a bare number, and every paragraph has text.
    for (const block of doc.blocks) {
      if (block.kind === "paragraph") assert.ok(block.content.length > 0, "empty paragraph");
    }
    assert.ok(!/^[\d^]+\.\d+\.\s*$/m.test(source), "a clause number with no text");

    // It is the contest text, with a contents list that makes sense.
    assert.match(doc.toc[0].text, firstHeading);
    assert.ok(doc.toc.length >= 8, "sections");
    assert.equal(new Set(doc.toc.map((item) => item.id)).size, doc.toc.length, "unique anchors");
    // And it is NOT the Origins Circle loyalty rules.
    assert.ok(!/ștampil|card de fidelitate|Gold/i.test(source), "not the Circle rules");
    assert.ok(/Bistro Arabica SRL/.test(source));
  });
}
