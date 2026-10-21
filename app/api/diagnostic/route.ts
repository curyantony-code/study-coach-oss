import { NextRequest, NextResponse } from "next/server";
import { getAllPages } from "@/lib/wiki";
import { mcqsFromCards, sasFromCards } from "@/lib/diagnostic-fallback";
import { toFlashcards } from "@/lib/flashcards";
import { parseAiJsonArray } from "@/lib/ai/json";
import { splitEarlyLate, tutorCourse } from "@/lib/course";
import { getActiveContent } from "@/lib/vault/active";
import { client, cloudRequest, ollamaClient, MODEL, hasApiKey, buildWikiSystemPrompt } from "@/lib/claude";
import type { DiagMCQ, DiagSA } from "@/lib/diagnostic-types";
import { shuffleInPlace, shuffleMcqOptions, shuffledCopy } from "@/lib/diagnostic-shuffle";
import { needOwnKey } from "@/lib/ai/keys";

/** Fewer usable questions than this and the test is not worth sitting. */
const MIN_MCQS = 15;
/** The questions are asked for in small batches: one large request often comes back empty or cut off. */
const MCQ_BATCHES = 3;
const BATCH_LATE = 6;
const BATCH_EARLY = 4;
const MAX_TRIES_PER_REQUEST = 2;
const OPTION_LETTERS = ["A", "B", "C", "D"];
const TARGET_MCQS = 30;
const TARGET_SAS = 4;

/** About this much note text per half of the course goes to the AI. */
const GROUP_BUDGET = 22_000;
const MIN_PAGE_CHARS = 1500;
const MAX_PAGE_CHARS = 8000;

/** When sourceSlug matches wiki pages, that decides curriculum group (fixes mis-tagged JSON). */
function resolveCurriculumGroup(
  slug: string,
  lateSlugs: ReadonlySet<string>,
  earlySlugs: ReadonlySet<string>,
  modelGroupRaw: unknown
): "late" | "early" | null {
  const inLate = lateSlugs.has(slug);
  const inEarly = earlySlugs.has(slug);
  if (inLate && !inEarly) return "late";
  if (inEarly && !inLate) return "early";
  if (inLate && inEarly) return "late";

  const g = typeof modelGroupRaw === "string" ? modelGroupRaw.trim().toLowerCase() : "";
  if (g === "late" || g === "early") return g;
  return null;
}

const MCQ_VARIANT_HINTS = [
  "Emphasize stems that ask for the MOST appropriate next step and stems centred on a rule, condition, or constraint from the course.",
  "Emphasize stems that ask which mistake was made and stems that compare two course concepts within one scenario.",
  "Emphasize stems that ask which explanation or justification applies and stems built on a common misconception.",
  "Emphasize stems that apply a method, model, or formula from the course to a concrete case and ask what follows.",
] as const;

const SA_VARIANT_HINTS = [
  "Prefer stems that ask what should be done or concluded next, with justification grounded in course concepts.",
  "Prefer stems that invite critique of someone's approach or reasoning using course terminology.",
  "Prefer stems where a character states a belief the student must show is incomplete, oversimplified, or partly wrong.",
] as const;

function saGenerationStrictness(level: number): string {
  if (level <= 2) {
    return "Scenario stems may be slightly shorter; still require identify + define + apply, but allow one clear paragraph of student response.";
  }
  if (level === 3) {
    return "Standard exam style: stems 3–5 sentences; student must identify the concept, define with course terms, and tie to 2+ scenario facts.";
  }
  if (level === 4) {
    return "Harder: add a plausible red herring in the scenario; the correct concept should not be named in the stem — student must infer it.";
  }
  return "Hardest: dense scenario with competing issues; grading later will be strict — the model answer implied by the stem must hinge on one fine distinction from the wiki.";
}

function buildGroupContext(pages: ReturnType<typeof Array.prototype.filter>, maxCharsPerPage = 2500): string {
  return (pages as { title: string; slug: string; rawContent: string }[])
    .map((p) => `# ${p.title} [slug: ${p.slug}]\n${p.rawContent.slice(0, maxCharsPerPage)}`)
    .join("\n\n---\n\n");
}

function parseMcqRow(
  row: unknown,
  lateSlugs: ReadonlySet<string>,
  earlySlugs: ReadonlySet<string>
): DiagMCQ | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  if (typeof o.stem !== "string" || !o.stem.trim()) return null;
  if (!Array.isArray(o.options) || o.options.length !== 4 || !o.options.every((x) => typeof x === "string")) return null;
  if (typeof o.correct !== "string") return null;
  if (typeof o.explanation !== "string") return null;
  if (typeof o.sourceSlug !== "string") return null;
  // The right answer must be one of A–D, and the four options must differ: otherwise the
  // student could be marked wrong for a right answer.
  const correct = o.correct.trim().charAt(0).toUpperCase();
  if (!OPTION_LETTERS.includes(correct)) return null;
  const texts = (o.options as string[]).map((option) => option.replace(/^\s*[A-Da-d][.)]\s*/, "").trim());
  if (texts.some((t) => !t) || new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) return null;
  const slug = o.sourceSlug.trim();
  const group = resolveCurriculumGroup(slug, lateSlugs, earlySlugs, o.group);
  if (!group) return null;
  return {
    stem: o.stem,
    options: texts.map((t, i) => `${OPTION_LETTERS[i]}. ${t}`),
    correct,
    explanation: o.explanation,
    sourceSlug: slug,
    group,
  };
}

function parseSaRow(
  row: unknown,
  lateSlugs: ReadonlySet<string>,
  earlySlugs: ReadonlySet<string>
): DiagSA | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  if (typeof o.stem !== "string" || !o.stem.trim()) return null;
  if (typeof o.concept !== "string") return null;
  if (typeof o.sourceSlug !== "string") return null;
  const slug = o.sourceSlug.trim();
  const group = resolveCurriculumGroup(slug, lateSlugs, earlySlugs, o.group);
  if (!group) return null;
  return {
    stem: o.stem,
    concept: o.concept,
    sourceSlug: slug,
    group,
  };
}

function selectMcqs(valid: DiagMCQ[]): DiagMCQ[] | null {
  if (valid.length < MIN_MCQS) return null;
  const late = shuffledCopy(valid.filter((q) => q.group === "late"));
  const early = shuffledCopy(valid.filter((q) => q.group === "early"));
  const TARGET = 30;
  const IDEAL_LATE = 18;
  const IDEAL_EARLY = 12;
  const latePick = late.slice(0, Math.min(IDEAL_LATE, late.length));
  const earlyPick = early.slice(0, Math.min(IDEAL_EARLY, early.length));
  let combined = [...latePick, ...earlyPick];
  // Fill to TARGET if we have extras
  if (combined.length < TARGET) {
    const extraLate = late.slice(latePick.length);
    const extraEarly = early.slice(earlyPick.length);
    const extras = [...extraLate, ...extraEarly].slice(0, TARGET - combined.length);
    combined = [...combined, ...extras];
  }
  shuffleInPlace(combined);
  return combined.slice(0, TARGET).map(shuffleMcqOptions);
}

function selectSas(valid: DiagSA[]): DiagSA[] | null {
  if (valid.length < 3) return null;
  const late = shuffledCopy(valid.filter((s) => s.group === "late"));
  const early = shuffledCopy(valid.filter((s) => s.group === "early"));
  const latePick = late.slice(0, Math.min(3, late.length));
  const earlyPick = early.slice(0, Math.min(1, early.length));
  let combined = [...latePick, ...earlyPick];
  // Fill to 4 from whichever group has extras
  if (combined.length < 4) {
    const extras = [...late.slice(latePick.length), ...early.slice(earlyPick.length)].slice(0, 4 - combined.length);
    combined = [...combined, ...extras];
  }
  shuffleInPlace(combined);
  return combined.slice(0, 4);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const model = searchParams.get("model") || MODEL;
  const isLocal = !!model && !model.includes("/");
  if (!isLocal && !hasApiKey()) {
    return NextResponse.json(
      { error: needOwnKey("OPENROUTER_API_KEY or OPENAI_API_KEY") },
      { status: 503 }
    );
  }

  const ai = isLocal ? ollamaClient : client;
  const level = (value: string | null, fallback: number) => Math.min(5, Math.max(1, parseInt(value ?? "", 10) || fallback));
  const difficulty = level(searchParams.get("difficulty"), 3);
  const saStrictness = level(searchParams.get("saStrictness"), difficulty);
  const variant = Math.max(0, parseInt(searchParams.get("variant") || "0", 10) || 0);
  const mcqVariantHint = MCQ_VARIANT_HINTS[variant % MCQ_VARIANT_HINTS.length];
  const saVariantHint = SA_VARIANT_HINTS[variant % SA_VARIANT_HINTS.length];

  const active = await getActiveContent();
  if (!active) return NextResponse.json({ error: "Add a vault first." }, { status: 404 });
  const course = tutorCourse(active.index);
  const pages = (await getAllPages()).filter((p) => p.rawContent.trim().length > 200);
  if (pages.length === 0) return NextResponse.json({ error: "This vault has no notes long enough to build a test from." }, { status: 422 });

  // Earlier and later parts of the course, by the vault's own unit order.
  const unitIds = new Set(active.index.units.map((u) => u.id));
  const halves = splitEarlyLate(active.index.units, pages, (p) => p.sources.filter((id) => unitIds.has(id)));
  // A big vault is sampled, so the request stays a sensible size; each test draws a different sample.
  const maxPages = Math.floor(GROUP_BUDGET / MIN_PAGE_CHARS);
  const latePages = halves.late.length > maxPages ? shuffledCopy(halves.late).slice(0, maxPages) : halves.late;
  const earlyPages = halves.early.length > maxPages ? shuffledCopy(halves.early).slice(0, maxPages) : halves.early;
  const perPage = (count: number) => Math.min(MAX_PAGE_CHARS, Math.max(MIN_PAGE_CHARS, Math.floor(GROUP_BUDGET / Math.max(count, 1))));
  const lateExample = latePages[0].slug;
  const earlyExample = earlyPages[0].slug;

  const lateCtx = buildGroupContext(latePages, perPage(latePages.length));
  const earlyCtx = buildGroupContext(earlyPages, perPage(earlyPages.length));
  const lateSlugs = new Set(latePages.map((p) => p.slug));
  const earlySlugs = new Set(earlyPages.map((p) => p.slug));

  const systemPrompt = `${buildWikiSystemPrompt(difficulty, course.name, course.units)}

<late_group_content title="Later part of the course: ${halves.lateLabel}">
${lateCtx}
</late_group_content>

<early_group_content title="Earlier part of the course: ${halves.earlyLabel}">
${earlyCtx}
</early_group_content>`;

  const mcqArchetypes = `STEM DIVERSITY (use many different "shapes" — not only "Which is MOST…"):
- Most appropriate next step for the person in the scenario
- Which rule, condition, or constraint from the course applies
- Which error or omission was made
- Which concept BEST explains what happened (name concepts only in options, not as the sole stem pattern)
- Identify the flaw, risk, or misconception in the approach
- Apply a method or formula from the course to the numbers given and choose the result or its interpretation
- Compare or contrast two course concepts within one situation
- Interpret quoted dialogue ("A student says: '…'") and choose the best analysis (required at difficulty 4–5 when possible)
Variant emphasis (still mix other styles): ${mcqVariantHint}
Use at least 5 distinct stem archetypes above; do not use any single archetype more than twice.`;

  const mcqUserPrompt = `Generate ${BATCH_LATE + BATCH_EARLY} scenario-based multiple-choice questions for ${course.name} (you may output one or two extra; the server will trim).
COVERAGE (order in the JSON array does NOT matter):
- Exactly ${BATCH_LATE} questions MUST have "group":"late" (lowercase only) and be grounded ONLY in <late_group_content>; each sourceSlug must be a slug from that section's headers
- Exactly ${BATCH_EARLY} questions MUST have "group":"early" (lowercase only) and be grounded ONLY in <early_group_content>; each sourceSlug must be a slug from that section's headers

${mcqArchetypes}

STRUCTURAL RULES (difficulty ${difficulty}/5):
- Every stem: 2–3 sentence realistic scenario from the subject of this course (a small applied problem with numbers where the material is quantitative) → closing question using varied phrasing ("Which…", "What is the MOST…", "Which…BEST explains…", "What should be done next…", etc.)
- NEVER ask for a bare definition ("What is X?") — always embed it in a scenario
- All 4 options must be plausible course-relevant answers; never use obviously wrong fillers
- At difficulty 4–5: use several quoted-speech stems and stems that hinge on a common misconception
- Write any formula in LaTeX between dollar signs
- "correct" field contains only the letter: "A", "B", "C", or "D"
- sourceSlug must exactly match one of the slug values shown in the content headers above
- "explanation" must be 1–2 sentences AND include at least one Obsidian wiki link to the grounding page using the exact sourceSlug, e.g. [[${lateExample}]]

Return ONLY a valid JSON array — no text before or after:
[{"stem":"...","options":["A. ...","B. ...","C. ...","D. ..."],"correct":"B","explanation":"… [[${lateExample}]]","sourceSlug":"${lateExample}","group":"late"}]`;

  const saUserPrompt = `Generate at least 4 scenario-based short-answer questions for ${course.name} (you may output one extra; the server will trim).
COVERAGE (order in the JSON array does NOT matter):
- Exactly 3 questions MUST have "group":"late" (lowercase) from <late_group_content> with sourceSlug from that section
- Exactly 1 question MUST have "group":"early" (lowercase) from <early_group_content> with sourceSlug from that section

TASK FRAMING (vary how the stem is phrased while keeping the same student job: identify + define + apply):
- ${saVariantHint}
- Also include at least one stem framed as recommendation, one as critique, and one as explaining consequences — these can appear in any order.

STRUCTURAL RULES (short-answer strictness ${saStrictness}/5 for how demanding the scenario + implied ideal answer should be):
- ${saGenerationStrictness(saStrictness)}
- Each stem: 3–5 sentence realistic scenario from the subject of this course (unless strictness 1–2 allows slightly shorter)
- Each stem must require the student to: (1) identify the concept, (2) define it precisely, and (3) explain how it applies to the scenario
- Test one specific concept central to the course, named in the wiki content
- The "concept" field names the concept being tested (used for grading reference only — not shown to student)
- sourceSlug must exactly match one of the slug values shown in the content headers above

Return ONLY a valid JSON array — no text before or after:
[{"stem":"...","concept":"the concept tested","sourceSlug":"${lateExample}","group":"late"},{"stem":"...","concept":"...","sourceSlug":"${earlyExample}","group":"early"}]`;

  const request = isLocal ? { model } : await cloudRequest(searchParams.get("model") || undefined);

  /** One request, tried again when the reply has too few usable rows (empty, cut off, or not JSON). */
  async function ask<T>(user: string, maxTokens: number, parse: (row: unknown) => T | null, enough: number, focus = ""): Promise<T[]> {
    let best: T[] = [];
    for (let attempt = 0; attempt < MAX_TRIES_PER_REQUEST && best.length < enough; attempt++) {
      const retryNote = attempt > 0 ? "\n\nYour previous reply could not be used. Reply with the JSON array only, complete and valid." : "";
      try {
        const res = await ai.chat.completions.create({
          // Local models get a cap; cloud ones that reason first need the room to reach the answer.
          ...request,
          ...(isLocal ? { max_tokens: maxTokens } : {}),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: user + focus + retryNote },
          ],
        });
        const rows = parseAiJsonArray(res.choices[0]?.message?.content || "").map(parse).filter((row): row is T => row !== null);
        if (rows.length > best.length) best = rows;
      } catch (error) {
        // One failed batch should not sink the whole test; the others may still be enough.
        console.error("Test Me request failed", error);
      }
    }
    return best;
  }

  try {
    const batchFocus = (i: number) => `\n\nThis is batch ${i + 1} of ${MCQ_BATCHES}: ${MCQ_VARIANT_HINTS[(variant + i) % MCQ_VARIANT_HINTS.length]} Spread the questions across different pages of the content.`;
    const [sas, ...mcqBatches] = await Promise.all([
      ask(saUserPrompt, 4500, (row) => parseSaRow(row, lateSlugs, earlySlugs), 3),
      ...Array.from({ length: MCQ_BATCHES }, (_, i) => ask(mcqUserPrompt, 7000, (row) => parseMcqRow(row, lateSlugs, earlySlugs), BATCH_LATE, batchFocus(i))),
    ]);
    // Batches can repeat a question: keep the first of each stem.
    const seenStems = new Set<string>();
    // A slug the AI made up would be a dead "review this" link: point it at a real page of that part.
    const realSlug = <T extends { sourceSlug: string; group: "late" | "early" }>(q: T): T =>
      lateSlugs.has(q.sourceSlug) || earlySlugs.has(q.sourceSlug) ? q : { ...q, sourceSlug: q.group === "early" ? earlyExample : lateExample };
    const rawMcqs = mcqBatches.flat().map(realSlug).filter((q) => {
      const key = q.stem.trim().toLowerCase().slice(0, 80);
      if (seenStems.has(key)) return false;
      seenStems.add(key);
      return true;
    });
    // Whatever the AI did not deliver is made up from the vault's own study cards.
    const cards = toFlashcards(active.index);
    const groupOf = (slug: string) => (earlySlugs.has(slug) && !lateSlugs.has(slug) ? "early" : "late");
    const mcqShort = Math.max(0, TARGET_MCQS - rawMcqs.length);
    const saShort = Math.max(0, TARGET_SAS - sas.length);
    const allMcqs = [...rawMcqs, ...(mcqShort > 0 ? mcqsFromCards(cards, mcqShort, groupOf) : [])];
    const allSas = [...sas.map(realSlug), ...(saShort > 0 ? sasFromCards(cards, saShort, groupOf) : [])];

    const pickedMcqs = selectMcqs(allMcqs);
    const pickedSas = selectSas(allSas);
    if (pickedMcqs && pickedSas) {
      const fromCards = [
        mcqShort > 0 ? `${Math.min(mcqShort, allMcqs.length - rawMcqs.length)} multiple-choice` : "",
        saShort > 0 ? `${Math.min(saShort, allSas.length - sas.length)} short-answer` : "",
      ].filter(Boolean);
      const notice = fromCards.length > 0 ? `The AI returned fewer questions than asked, so ${fromCards.join(" and ")} question(s) were made from your study cards instead.` : null;
      return NextResponse.json({ mcqs: pickedMcqs, sas: pickedSas, notice });
    }

    return NextResponse.json(
      {
        error: `There was not enough to build a test from: the AI returned ${rawMcqs.length} usable multiple-choice and ${sas.length} short-answer questions, and this vault has too few study cards to fill the gap. Try again, or pick a more capable model.`,
      },
      { status: 500 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
