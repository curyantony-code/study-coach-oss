# How Study Coach works

This is the map for contributors: the names used in code and UI, how a folder of notes
becomes study material, and the learning-science rules every feature follows.

## Core concepts

```
Vault        a folder of Markdown notes (an Obsidian vault, or one the app builds from your files)
 └ Course    one course per vault (name, code, term), from the vault's study.yml or inferred
    ├ Unit        a chapter / week / module (e.g. "Week 3 — Market Efficiency")
    ├ Assessment  a test, quiz, midterm or final: date, weight, format, which units it covers
    └ Node        one note in the vault (source, concept, entity, or plain note) = a point in the graph
         └ Card   one question/answer extracted from a node (exam tips, highlights, tables, Q&A)
Edges        [[wikilinks]] between nodes (and shared tags) → the knowledge graph
Scope        what the student is studying right now: course | assessment | unit | node(+neighbours) | weakest
```

- A node can belong to several units (frontmatter `sources: [wk1, wk2]`).
- An assessment covers units; its cards are all cards in the nodes of those units. A
  cumulative final covers everything before it.
- Weeks and textbook chapters can both exist: a unit has an `id`, a `label` and optional
  `aliases` (e.g. `wk3` ↔ `ch9`), so material tagged by chapter and lectures tagged by week
  land in the same unit.

## Where things live

| Folder | What |
|---|---|
| `lib/vault/` | Reads a vault into units, assessments, notes, links and cards (read-only) |
| `lib/build/` | "New course from files": turns uploaded PDFs and notes into a new vault |
| `lib/ingest/` | Reads text out of PDFs (Poppler, plus the Mac text reader or Tesseract for scans) |
| `lib/learner/` | Pure learner-model logic: FSRS ratings, queue, mastery, readiness, hints |
| `lib/schedule/` | Study plans and assessment dates |
| `lib/db/` | Local SQLite database (`node:sqlite`), at `data/study.db` or the desktop app's data folder |
| `lib/ai/`, `lib/claude.ts`, `lib/model-policy.ts` | Which AI model answers, with cheap/free defaults |
| `app/` | Next.js pages and API routes |
| `desktop/` | Electron shell that runs the app's own server on `127.0.0.1` |
| `tests/` | Vitest tests, with one small sample vault per vault style in `tests/fixtures/` |

## Reading a vault (`lib/vault/`)

One interface, several detectors, so any vault works:

```ts
interface VaultIndex {
  course: Course;                 // from study.yml or inferred
  units: Unit[];                  // chapters/weeks/modules
  assessments: Assessment[];
  nodes: Node[];                  // id = vault-relative path; title, type, tags, unitIds, body
  edges: Edge[];                  // from [[wikilinks]] (+ optional shared-tag edges)
  cards: Card[];                  // id = hash(vaultId + nodePath + front)
  warnings: string[];             // shown in the vault health screen
}
```

Detection order (first match wins; a manifest always overrides):

1. **`study.yml` present**: use it for course, units, assessments and card rules.
2. **Wiki-schema vault** (frontmatter `type: source|concept|entity`, `sources: [wkN]`): units
   from `sources` values and the overview note; nodes from `wiki/**`; cards from exam tips,
   highlights, misconceptions and tables.
3. **Generic vault**: units from top-level folders (or `chapter`/`week` frontmatter, or tags
   like `#ch3`); nodes are notes; cards from callouts (`> [!question]`), `Q:`/`A:` pairs,
   `term:: definition`, `question ? answer` lines, bold-term definitions, table rows and
   headings. Anything ambiguous becomes a warning, not a guess.

Vaults are **read-only by default**. Writing (`study.yml`, card drafts into `_study-drafts/`)
needs a per-vault switch plus confirmation each time. The app never touches `.obsidian/`.

The note format the app reads best is in [`vault-format-prompt.md`](vault-format-prompt.md);
the rules every displayed question must follow are in [`question-rules.md`](question-rules.md).

## `study.yml` (per vault, optional, human-editable)

```yaml
course:
  code: FIN 101
  name: Introduction to Finance
  term: Fall 2026
content:
  include: [notes/**]
  exclude: [_study-drafts/**]
units:
  - { id: wk1, label: "Week 1 — Time Value of Money", aliases: [ch2] }
  - { id: wk2, label: "Week 2 — Bonds",               aliases: [ch3] }
  - { id: wk3, label: "Week 3 — Stocks" }
assessments:
  - id: midterm
    label: Midterm
    date: 2026-10-20
    weight: 30
    format: [mcq, short-answer]
    covers: [wk1, wk2]
  - id: final
    label: Final exam
    date: 2026-12-15
    weight: 40
    format: [mcq, short-answer, essay]
    covers: all                 # cumulative
    emphasis: [wk3]
cards:
  sources: [exam-tips, highlights, misconceptions, tables]
  kind: mixed                   # conceptual | procedural | mixed (drives worked-example fading)
```

Assessment fields: `id`, `label`, `date`, `weight`, `format`, `covers` (unit ids or `all`),
optional `emphasis`, `practice` (notes that are practice exams, used as question sources but
never counted twice), optional `type: quiz|test|midterm|final`.

## Learning-science rules

These decide every feature. Details and sources: [`learning-science/`](learning-science/README.md).

| Principle (evidence) | Build rule |
|---|---|
| Self-testing and spacing are the top two techniques (Dunlosky et al. 2013) | Every mode makes the student produce an answer first. FSRS scheduling. Items must eventually be answered correctly. |
| Rereading/highlighting barely help | Browse/notes are reference only; they never count as study. |
| "Learning styles" are a myth | Never label students by style; preferences only change which modes are suggested. |
| Active work helps everyone (generation, enactment, drawing) | Write/match/arcade, guess-first, teach-back. |
| Students misjudge what they know; confident-and-wrong is the top signal | Ask confidence before revealing the answer; confident misses jump the queue. |
| Guessing before learning helps (g≈0.34–0.54 with feedback) | Guess-first on unseen cards. |
| Explaining helps when students expect to teach (g≈0.35–0.56) | Teach-back mode, announced up front. |
| Worked examples help novices, hurt experts | Fade hints as node mastery rises. |
| Phone distraction and sleep loss hurt | Focus nudge + tab-switch detection; one-tap sleep check-in; low sleep → review only. |
| Interleaving helps tell similar ideas apart | Assessment and course scopes mix units; node scope pulls in linked neighbours. |
| Match practice to exam format | Question mix follows the assessment's `format`. |
| Adaptive systems help modestly (≈0.2–0.4 SD) | Log every attempt so it can be tested; don't overclaim. |

## Learner model (`lib/learner/`, pure functions, tested)

- FSRS rating: wrong → Again; right + "guessing" → Hard; right + "fairly sure" or no
  confidence asked → Good; right + "certain" or Flashcard "Nailed it" → Easy.
- Queue: confident-wrong first, then due date, then retrievability; in assessment scope also
  weighted by `emphasis` and days to the date.
- Exam mode: within 14 days of an assessment, desired retention rises (0.90 → 0.95) and each
  card is reviewed at least once in the final 3 days.
- Node mastery = mean retrievability of its cards; unit mastery = card-weighted mean of its
  nodes; readiness = mean projected retrievability on the assessment date.
- Best mode = accuracy on later reviews of cards first studied in each mode (≥ 3 later
  reviews); the Smart session shifts up to 30% toward it and never drops spaced self-testing.
- Hint fading: node mastery < 0.4 → hints first; > 0.7 → none.
- Low-sleep day → review only.

## Data and privacy

Everything stays on the student's computer: the database, the vault list and all progress.
There is no account, no telemetry and no analytics. Text leaves the computer only when the
student has added an AI key and uses an AI feature, and then only to the provider they chose.
Never infer health or psychological labels from study data.

## AI cost

AI is optional and kept cheap: code does the work wherever it can, and AI calls default to
small or free models. Local models are capped at 4B parameters so they run on a laptop.
