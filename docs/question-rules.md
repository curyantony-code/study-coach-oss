# Project rule: every question must be answerable on its own

This is a rule of Study Coach itself. It applies to every vault, every study mode and every
place the app shows or writes a question. It is not a setting and no vault opts out.

## The rule

A question is acceptable only if a student could answer it with nothing else in front of them:

1. **Every given is stated.** Amounts, rates, time frames, compounding, units, and each case to
   be compared. If the worked solution uses it, the question says it.
2. **It asks for something.** A list of givens ("EBIT 400, tax 40%, r0 = 20%.") is not a question.
3. **It does not lean on another question.** No "same data", "as above", "the previous problem".
4. **It does not contain its own answer**, or any value the solution computes.

## Where the rule lives in the code

Everything goes through one module, `lib/questions/rules.ts`:

| What | How the rule is applied |
|---|---|
| `questionIssues(question, solution?, name?)` | Finds breaches 1 to 3 without any AI. Used wherever the app reads a question from a vault. |
| `SELF_CONTAINED_RULE` | The rule as text. Every prompt that has an AI write a question must include it. |

Current users, all of which work for any vault:

- **Questions are shown written out in full by default.** A problem that only has the notes'
  short wording is written out by the AI the first time it is opened, and the Problems page
  can work through the whole vault (`lib/ai/complete-question.ts`). Each rewrite is checked for
  breach 4 (`acceptCompletion`, `readCompletion`) and kept in the app database.
- **Three wordings, one switch** (`QuestionStyle` in `lib/problems/fixes.ts`): in full (default),
  condensed (only the givens and a "Find:" line, still answerable on its own), or as in the
  notes. The choice is global and remembered; study sessions and quizzes follow it.
- **"Something missing?"** on every problem lets the student tell the AI what is missing or
  wrong; that note goes into the rewrite prompt.
- **A note's wording that breaks the rule** is still flagged, with the reason, until a full
  version exists.
- **Vault health page** lists "Unclear questions" for the vault.
- **AI-written questions** (quiz variants, mock exam, tutor chat, Test Me, drafted cards) carry
  `SELF_CONTAINED_RULE` in their prompt, and `readVariants` discards a reply that breaks it.

## When you add a feature

- If it **shows** a question taken from a vault, run `questionIssues` and surface the result.
- If it **has an AI write** a question, put `SELF_CONTAINED_RULE` in the prompt and validate
  the reply with `questionIssues` before showing it.
- Never fix a question by editing the vault unless the vault's write toggle is on and the
  owner confirms. The fix belongs in the app database, with the note's wording one click away.
- Add a test in `tests/question-rules.test.ts`; that file asserts every question-writing prompt
  contains the rule.

## What the checks cannot see

`questionIssues` judges wording, not meaning. It catches a missing time frame, but not a missing
interest rate; it knows common "ask" words, not every way of asking. The AI rewrite covers the
rest on request. The lasting fix is a vault written to the format in `docs/vault-format-prompt.md`.
