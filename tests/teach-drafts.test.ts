import { describe, expect, test } from "vitest";
import { draftFileName, draftFileNames, draftSystemPrompt, formatDraftFile, parseDrafts } from "@/lib/ai/drafts";
import { gradeSystemPrompt, gradeUserPrompt, keyPoints, parseGrade, scoreBand } from "@/lib/learner/teachback";
import { buildIndex } from "@/lib/vault/build";
import { indexFixture } from "./helpers";

describe("teach-back grading", () => {
  test("reads a clean JSON grade", () => {
    expect(parseGrade('{"score": 72.4, "covered": ["diversification lowers risk"], "missing": ["market risk remains"], "tip": "Say what cannot be diversified."}')).toEqual({
      score: 72, covered: ["diversification lowers risk"], missing: ["market risk remains"], tip: "Say what cannot be diversified.",
    });
  });

  test("finds the JSON inside a code fence or surrounding chatter", () => {
    const reply = 'Here is the grade:\n```json\n{"score": "40", "covered": [], "missing": ["a", "b"], "tip": ""}\n```\nHope that helps!';
    expect(parseGrade(reply)).toEqual({ score: 40, covered: [], missing: ["a", "b"], tip: "" });
  });

  test("fills in optional parts and rejects anything else", () => {
    expect(parseGrade('{"score": 10}')).toEqual({ score: 10, covered: [], missing: [], tip: "" });
    const malformed = ['{"score": null}', '{"score": ""}', '{"score": 0.85}', '{"score": [85]}', '{"score": true}', '{"score": "85%"}', '{"score": -1}'];
    for (const bad of ["", "no json here", "{not json}", '{"score": 150}', '{"score": "high"}', '{"covered": []}', '{"score": 50, "covered": "all"}', ...malformed]) {
      expect(parseGrade(bad)).toBeNull();
    }
  });

  test("the prompts carry the note, the explanation and the required JSON shape", () => {
    expect(gradeSystemPrompt("FIN 101")).toMatch(/ONLY a JSON object/);
    expect(gradeSystemPrompt("FIN 101")).toContain("FIN 101");
    expect(gradeUserPrompt({ title: 'A "note"', body: "Body" }, "  my words  ")).toBe("<note title=\"A 'note'\">\nBody\n</note>\n\n<student_explanation>\nmy words\n</student_explanation>");
  });

  test("key points for self-rating come from the note's cards, without worked problems", () => {
    const index = indexFixture("wiki-vault");
    expect(keyPoints("wiki/sources/wk1-intro.md", index.cards)).toEqual(["Human capital", "Strategic planning"]);
    expect(keyPoints("wiki/overview.md", index.cards)).toEqual([]);
  });

  test("score bands", () => {
    expect([scoreBand(70), scoreBand(69), scoreBand(40), scoreBand(39)]).toEqual(["strong", "middling", "middling", "weak"]);
  });
});

describe("AI card drafts", () => {
  test("reads Q/A pairs and ignores the rest of the reply", () => {
    const reply = "Sure! Here are the cards:\n\nQ: Why does diversification reduce risk?\nA: Because firm-specific shocks\naverage out across many assets.\n\n**Q:** What risk remains?\n**A:** Market risk.\n\nQ: Hi?\nA: x\n\nLet me know if you want more.";
    expect(parseDrafts(reply)).toEqual([
      { question: "Why does diversification reduce risk?", answer: "Because firm-specific shocks average out across many assets." },
      { question: "What risk remains?", answer: "Market risk." },
    ]);
    expect(parseDrafts("nothing useful")).toEqual([]);
  });

  test("accepts numbered cards", () => {
    expect(parseDrafts("1. Q: What remains after diversifying?\nA: Market risk.\n\n2) Q: Why diversify at all?\nA: To cut firm-specific risk.")).toHaveLength(2);
  });

  test("offers a fresh file name instead of replacing earlier drafts", () => {
    const names = draftFileNames("Node 2");
    expect(names.slice(0, 3)).toEqual(["Node-2-drafts.md", "Node-2-drafts-2.md", "Node-2-drafts-3.md"]);
    expect(names).toHaveLength(20);
    expect(new Set(names).size).toBe(20);
  });

  test("caps the number of cards", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Q: Question number ${i}?\nA: Answer ${i}.`).join("\n\n");
    expect(parseDrafts(many)).toHaveLength(12);
  });

  test("the saved file is understood by the app's own card rules once moved into a note", () => {
    const file = formatDraftFile("Node 2", [{ question: "Why diversify?", answer: "To cut firm-specific risk." }, { question: "What remains?", answer: "Market risk." }], "2026-10-07");
    expect(file).toContain("# Draft cards for [[Node 2]]");
    expect(file).toContain("Drafted by AI on 2026-10-07");
    const index = buildIndex({ vaultName: "v", paths: ["moved.md"], read: () => file, manifestText: null });
    expect(index.cards.filter((c) => c.type === "qa").map((c) => [c.front, c.back])).toEqual([["Why diversify?", "To cut firm-specific risk."], ["What remains?", "Market risk."]]);
  });

  test("drafts kept in _study-drafts are not studied", () => {
    const index = indexFixture("generic-vault");
    expect(index.nodes.some((n) => n.id.startsWith("_study-drafts/"))).toBe(false);
  });

  test("file names are safe whatever the note is called", () => {
    expect(draftFileName("FIN 101 - Node 2 - Portfolio Selection")).toBe("FIN-101---Node-2---Portfolio-Selection-drafts.md");
    expect(draftFileName("../../etc/passwd")).toBe("etcpasswd-drafts.md");
    expect(draftFileName("???")).toBe("note-drafts.md");
    expect(draftFileName("a".repeat(200))).toHaveLength(80 + "-drafts.md".length);
    expect(draftSystemPrompt("X")).toMatch(/Do not invent facts/);
  });
});
