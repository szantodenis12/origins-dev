#!/usr/bin/env python3
"""Campaign legal drafts -> publishable markdown for origins-platform/content/concurs/.

Strips what is addressed to us (YAML, breadcrumb, draft notice, [avocat] /
[de confirmat ...] markers with their notes, links to internal .md files, the
"De confirmat" and "Anexe" tails). Adds nothing. Prints every marker it met and
what it did, so the report can list clauses left incomplete.
"""
import os, re, sys, time

SRC = "/Users/rolandsipos/Documents/Epic Digital Hub/CLIENTI/OriginsCafe/CAMPANII/ORIGINS_CHRISTMAS_2026/03_Regulations_GDPR"
OUT = "/Users/rolandsipos/Documents/Epic Digital Hub/origins-platform/content/concurs"

MARKER = re.compile(r"\s*\*\*\[[^\]]*\]\*\*")
# Text right after a marker that IS clause text (the marker only says it needs confirming).
KEEP_AFTER = [
    "Programul din zilele de 30.11",
    "Desenele realizate pe altă hârtie",
    "Organizatorul poate decide prelungirea",
    "3 ani, la fel ca licența",
]
# Whole sentences addressed to us that carry no marker.
DROP_SENTENCES = [
    "Programul se reconfirmă înainte de publicare.",
    "Avocatul stabilește temeiul final.",
    "Versiunea de față: 1, din 31.10.2026 (proiect).",
]
# While the source still has notes for the lawyer or the client, the public page says so first.
PENDING = re.compile(r"\[(?:avocat|de confirmat|propunere)", re.I)
PENDING_NOTICE = "**Proiect în curs de verificare juridică.** Versiunea finală se publică înainte de 16.11.2026."
SENT_END = re.compile(r"(?<=[.;!?])\s+(?=[A-ZĂÂÎȘȚ„a-z]\)?|\Z)")

def first_fragment_end(text):
    """Index where the note after a marker ends: sentence end, table cell end, or line end."""
    ends = [len(text)]
    cell = text.find(" |")
    if cell >= 0: ends.append(cell)
    m = re.search(r"[.!?](?=\s+[A-ZĂÂÎȘȚ„]|\s*$)|;(?=\s*$)", text)
    if m: ends.append(m.end())
    return min(ends)

def strip_markers(line, log, where):
    while True:
        m = MARKER.search(line)
        if not m: return line
        before, after = line[:m.start()], line[m.end():]
        marker = m.group(0).strip()
        rest = after.lstrip()
        if rest[:1] in ",.;:)" or rest.startswith("|") or rest == "":
            log.append((where, marker, "marker removed, nothing else", ""))
            line = before + after
            continue
        if any(rest.startswith(k) for k in KEEP_AFTER):
            log.append((where, marker, "KEPT the text after it (clause text, unconfirmed)", rest[:90]))
            line = before + " " + rest
            continue
        end = first_fragment_end(rest)
        dropped, tail = rest[:end], rest[end:]
        log.append((where, marker, "dropped the note after it", dropped))
        b = before.rstrip()
        # The note carried the clause's closing punctuation: give it back.
        if b and b[-1] not in ".;:!?|" and not b.endswith("**") :
            b += dropped.rstrip()[-1] if dropped.rstrip()[-1:] in ".;" else "."
        elif b.endswith("**") and b[-3:-2] not in ".;:":
            b += dropped.rstrip()[-1] if dropped.rstrip()[-1:] in ".;" else "."
        line = b + ((" " + tail.lstrip()) if tail.strip() and not tail.lstrip().startswith("|") else tail)

def convert(name, title, out_name):
    path = os.path.join(SRC, name)
    raw = open(path, encoding="utf-8").read()
    mtime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(path)))
    fm = re.match(r"---\n(.*?)\n---\n", raw, re.S)
    updated = re.search(r"last-updated:\s*(\d{4}-\d{2}-\d{2})", fm.group(1)).group(1)
    body = raw[fm.end():]
    log = []
    lines = body.split("\n")
    out, article = [], ""
    for line in lines:
        s = line.strip()
        if s.startswith("`CLIENTI/"): continue                 # breadcrumb
        if s.startswith(">"): continue                          # draft notice
        if re.match(r"###\s+(Anexe|De confirmat)", s): break    # internal tails
        if s.startswith("# "): continue                         # the page brings its own plain title
        if s.startswith("## "): article = s[3:]
        for sentence in DROP_SENTENCES:
            if sentence in line:
                log.append((article, "(no marker)", "dropped a sentence addressed to us", sentence))
                line = line.replace(" " + sentence, "").replace(sentence + " ", "").replace(sentence, "")
        # links to our internal files: the nota becomes a link to the privacy page, the rest go
        line = re.sub(r"\s*\(\[`03_NOTA_INFORMARE_DATE_v1\.md`\]\([^)]*\)\)", " ([Cum folosim datele](/confidentialitate))", line)
        n = len(re.findall(r"\(\[`[^`]*\.md`\]\([^)]*\)\)", line)) + len(re.findall(r"\[`[^`]*\.md`\]\([^)]*\)", line))
        if n: log.append((article, "(internal link)", "removed a link to an internal .md file", re.sub(r"\s+", " ", line)[:110]))
        line = re.sub(r"\s*\(\[`[^`]*\.md`\]\([^)]*\)\)", "", line)
        line = re.sub(r",?\s*din \[`[^`]*\.md`\]\([^)]*\)", "", line)
        line = re.sub(r"\[`[^`]*\.md`\]\([^)]*\)", "", line)
        if re.search(r"\s*\(document \d\d\)", line):
            log.append((article, "(internal ref)", "removed „(document NN)”", ""))
            line = re.sub(r"\s*\(document \d\d\)", "", line)
        line = strip_markers(line, log, article)
        # A clause that was nothing but a note to us leaves only its number: drop the line.
        if re.match(r"^[\d^]+\.\d+\.\s*$", line.strip()):
            log.append((article, "(empty clause)", "DROPPED a clause number left with no text", line.strip()))
            continue
        out.append(line.strip() if line.strip() and not line.startswith(("|", "-", " ")) else line.rstrip().lstrip(" ") if line.startswith(" ") else line.rstrip())
    text = "\n".join(out).strip()
    text = re.sub(r"\n---\s*$", "", text).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    assert "**[" not in text and ".md" not in text and "De confirmat" not in text, name
    # The draft notice (">" lines) mentions the markers by name; only clause text counts.
    if PENDING.search("\n".join(l for l in body.split("\n") if not l.strip().startswith(">"))):
        text = PENDING_NOTICE + "\n\n" + text
        print(f"  NOTICE: {name} still has [avocat]/[de confirmat]/[propunere] markers -> draft notice at the top")
    if callable(title): title = title(raw)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, out_name), "w", encoding="utf-8") as f:
        f.write(f"---\ntitlu: {title}\nactualizat: {updated}\n---\n\n{text}\n")
    print(f"\n== {name}  (source modified {mtime}, last-updated {updated}) -> content/concurs/{out_name}")
    for where, marker, what, detail in log:
        print(f"  [{where[:34]:34}] {marker:44} {what}" + (f": {detail}" if detail else ""))

# The contest name goes into the rules title only if the rules themselves use it.
convert(
    "01_REGULAMENT_CONCURS_v1.md",
    lambda raw: "Regulamentul concursului Desen la pachet" if "Desen la pachet" in raw else "Regulamentul concursului de desene",
    "regulament.md",
)
convert("03_NOTA_INFORMARE_DATE_v1.md", "Cum folosim datele", "confidentialitate.md")
