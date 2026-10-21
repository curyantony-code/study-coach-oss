# Vault format prompt for Study Coach

Paste everything in the box below into Claude (or any AI) when you ask it to build or tidy an
Obsidian vault for a course. It describes exactly what Study Coach reads, so the notes it
writes turn into good cards, problems, quizzes and schedules without clean-up.

Keep this file in step with `lib/vault/cards/`, `lib/vault/units.ts` and `lib/questions/rules.ts`.

---

```text
You are building an Obsidian vault of study notes for one university course. The vault will be
read by an app called Study Coach, which turns notes into flashcards, worked problems, quizzes,
mock exams and a study schedule. Follow this format exactly: the app reads structure, not intent.

COURSE: <course code and name>
SOURCES: everything in raw/ (slides, textbook chapters, the course outline, problem sets).
Never edit or delete anything in raw/ or .obsidian/.

=====================================================================
1. LAYOUT
=====================================================================
<vault>/
  study.yml                  course, units, tests (section 2)
  raw/                       source files, untouched
    Course Info/<CODE> - Course Outline.pdf        keep "Outline" in the name
    Practice & Solutions/<Textbook> - Problem Sets.pdf   keep "Problem" in the name
  wiki/
    <Unit folder>/           one folder per unit, named as the course names it
      <CODE> - Topic 01 - <Title>.md               one note per topic
    _Hubs/                   formula sheet, glossary, cumulative quiz (folders starting
                             with "_" are housekeeping and are not offered as topics)

- Put ALL study notes under wiki/. The app studies wiki/ only.
- One note = one topic the student could be quizzed on by itself. Do not merge topics.
- Title every note "<CODE> - <Topic or Chapter NN> - <Title>".
- Inside a note, use "## " headings for each idea. Keep each "## " section focused and under
  about 3,000 characters: the AI tutor and the video finder work section by section.

=====================================================================
2. study.yml (at the vault root)
=====================================================================
course:
  code: FIN 101
  name: Introduction to Finance
  term: Fall 2026
  textbook: Finance Basics, 2nd ed.
content:
  include: [wiki/**]
  exclude: [raw/**, _study-drafts/**]
units:                       # in teaching order; id is short, lower-case, no spaces
  - { id: node1, label: "Node 1 - Risk, Return & Utility", aliases: [ch5, ch6] }
  - { id: node2, label: "Node 2 - Portfolio Selection",    aliases: [ch7] }
assessments:                 # every test, with its real date (YYYY-MM-DD)
  - id: midterm
    label: Midterm
    type: midterm            # quiz | test | midterm | final
    date: 2026-10-22
    weight: 25
    format: [mcq, short-answer]
    covers: [node1, node2]   # unit ids, or: all
  - id: final
    label: Final exam
    type: final
    date: 2026-12-10         # if not announced, use one week after the last class and say so
    weight: 40
    format: [mcq, problems]
    covers: all
    emphasis: [node5, node6]
cards:
  kind: procedural           # conceptual | procedural | mixed

A note joins a unit through its frontmatter. Use the unit's id:
---
units: [node2]
tags: [fin101]
---
(Without study.yml the app falls back to the note's folder name, or to frontmatter numbers such
as "week: 3" or "chapter: [5, 6]".)

=====================================================================
3. THE RULE FOR EVERY QUESTION  (most important section)
=====================================================================
Every question you write, anywhere, must be answerable on its own:

1. State every given the solution uses: amounts, rates, time frames, compounding frequency,
   units, and each case to be compared.
     BAD : Compare FV of $1,000 at a 12% APR compounded annually, quarterly, daily and continuously.
     GOOD: You invest \$1,000 at a 12% APR. Find the effective annual rate and the future value
           after 1 year and after 20 years under annual, quarterly, daily and continuous compounding.
2. Say what must be found. A list of givens is not a question.
     BAD : EBIT \$166.67, tax 40%, r0 = 20%, rB = 10%. Issue \$200 of debt.
     GOOD: ...The firm issues \$200 of debt to buy back shares. Find the value of the levered
           firm, the value of its equity, its cost of equity and its WACC.
3. Never lean on another question. No "same data", "as above", "the previous problem",
   "using P11's stock". Repeat the numbers.
4. Never put the answer, or any computed value, in the question.
5. Write full sentences. Do not compress a question into shorthand to save space.

Before you finish a note, reread each question with the solution covered. If you could not
start working, the question is incomplete: fix it.

=====================================================================
4. WORKED PROBLEMS
=====================================================================
Each worked problem is its own "### " heading, followed by these bold markers in order:

### Ch7-P6 Graphical Tangency
**Problem (Canadian 6 = US 6).** <the full question, obeying section 3>

**Formula required:** $\text{Sharpe}=\dfrac{E(r_P)-r_f}{\sigma_P}$

**Solution.** <step-by-step working, one step per line, ending with the answer>

Rules:
- EVERY problem in a note uses the same heading level ("### "). Never put one problem under
  another: a deeper heading ("#### ") directly below a problem is read as part of that
  problem's solution. Use "#### " only for parts inside a solution ("#### Part (b)").
- The heading names the problem and must be unique in the vault.
  - Textbook problems:  "Ch<chapter>-P<number> <Short Title>"   e.g. "Ch7-P6 Graphical Tangency"
  - CFA problems:       "Ch<chapter>-CFA<number> <Short Title>" e.g. "Ch7-CFA5 Diversification"
  - Several at once:    "Ch9-P10 to P16 <Title>"  or  "Ch10-CFA3 CFA4 CFA6 <Title>"
  - Lecture examples:   "T<topic> L<number> - <Title>"          e.g. "T2 L3 - MMCC Bowling Ball"
- "**Problem.**" may carry a note in brackets. Use it for edition differences only, written
  exactly "Canadian 4 = US 5" (or "Canadian CFA 1 = US CFA 2"). Write "Canadian 9" alone when
  the problem exists only in the course's edition.
- "**Formula required:**" is one line: the formula(s) needed. It is shown as an optional hint.
- "**Solution.**" is required. Without it the section is not read as a problem.
- Show the working, not only the result. New practice questions are modelled on these
  solutions by changing the numbers, so a solution that shows each step produces better ones.
- If a problem has parts, label them (a), (b), (c) in BOTH the question and the solution.

=====================================================================
5. FLASHCARDS (any of these forms; pick the one that fits the content)
=====================================================================
a) Definition, alone on its own line or list item (at least 10 characters after the term):
   **Sharpe ratio**: excess return per unit of total risk.

b) Question and answer:
   Q: Why does leverage not change the Sharpe ratio?
   A: Borrowing scales expected excess return and standard deviation by the same factor.

c) Callout:
   > [!question] Which risk does the CAPM reward?
   > Only systematic risk, because the rest can be diversified away.

d) Table. The FIRST column is the prompt; the other columns, with their headers, are the answer:
   | Symbol | Meaning |
   |---|---|
   | $\beta$ | Sensitivity of an asset's return to the market's return |

e) Numbered quiz with an answer key (questions first, answers under a heading "## Answer key",
   matched by number):
   **Q1.** Define systematic and unsystematic risk. Which one does the CAPM reward?
   ...
   ## Answer key
   **Q1.** Systematic risk comes from economy-wide shocks and cannot be diversified away...

Rules for cards:
- One idea per card. The answer should be one to three sentences, or one formula.
- Table prompts must be something to recall. Do NOT make the first column a location or log
  ("Where", "Page", "Slide", "Date", "#", "File", "Link"): such tables are skipped.
- Do not write " ? " (space, question mark, space) in the middle of an ordinary line: the app
  reads "question ? answer" as a card.
- Tables that run the course make no cards: any table with a "Weight", "Due" or "Deadline"
  column, and any table whose answer columns are all yes/no questions ("On sheet?").
- A table row whose first cell only names a part of the course ("Topic 5", "Week 3") makes
  no card, and neither does "**Drill**: Ch6-P5, Ch6-P17" (an answer that is only problem codes).
- A "## " section that is mostly a table, or that holds its own "### " sections and more than
  about 60 words, is not turned into one big card.
- Checklists ("- [ ] ...") and lists of links make no cards. Use them freely for trackers.
- Do not put study content inside code blocks: code blocks are ignored.

=====================================================================
6. MATHS AND MONEY
=====================================================================
- Inline maths: $E(r_P)=w_A E(r_A)+w_B E(r_B)$. No space just inside the dollar signs.
- Display maths on its own lines between $$ and $$.
- Money is ALWAYS written with a backslash: \$1,000. A bare $ is read as the start of a formula.
- Percent inside maths: 12\%. Outside maths: 12%.

=====================================================================
7. HUB NOTES (in wiki/_Hubs/)
=====================================================================
- "<CODE> - Formula Sheet.md": a table  | Sheet label | Formula |  one formula per row.
- "<CODE> - Variables Glossary.md": a table  | Symbol | Meaning |.
- "<CODE> - Cumulative Quiz.md": form 5e, about 20 questions across the course.
- A problem tracker may be a checklist; it will not become cards.
- An errata log may be a table whose first column is "Where": it is skipped, as intended.

=====================================================================
8. BEFORE YOU FINISH, CHECK
=====================================================================
[ ] Every note is under wiki/, in a unit folder, with "units: [id]" in its frontmatter.
[ ] study.yml lists every unit in order and every test with a date.
[ ] Every worked problem is a "### " heading (all at the same level), unique, in the right pattern, with **Problem.**,
    **Formula required:** and **Solution.** with the working shown.
[ ] Every question passes section 3 with its solution covered.
[ ] Every dollar amount is written \$..., every formula is inside $...$.
[ ] No table uses its first column for locations; no " ? " inside ordinary lines.
[ ] Nothing in raw/ or .obsidian/ was changed.

Report what you created, and list any question you could not make complete because the
source did not give the information.
```

---

## Why each part matters

| In the prompt | What Study Coach does with it |
|---|---|
| One note per topic, under `wiki/<Unit>/` | Each note is a topic you can pick in AI Quiz; folders become units. |
| `study.yml` with dated tests | Exam countdown, readiness score, exam mode, and exact Midterm/Final coverage for the AI mock exam. |
| Section 3, the question rule | The app flags questions that break it, in every vault. Notes that follow it need no fixing. |
| Problem headings `Ch7-P6`, `T2 L3 -` | Problems are grouped by chapter or topic, matched to the course outline and to the textbook's wording. |
| Working shown in **Solution.** | AI questions are built by re-numbering these examples; fuller working gives better questions. |
| Card forms 5a to 5e | These are the only shapes the card reader recognises. |
| `\$` for money | Stops prices being drawn as formulas. |
| "Outline" and "Problem" in PDF names | The Schedule and Problems pages list those files first. |
