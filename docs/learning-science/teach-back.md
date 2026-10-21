# Teaching it back

## The principle

Explaining material helps most when students expect to teach it; the handover cites g≈0.35–0.56.

## What Study Coach does

- Teach back asks the student to explain a note from memory “as if teaching a classmate”, and says so before they start.
- An AI compares the explanation with the note and returns what was covered, what was missed and one thing to fix. The reply is validated; a malformed one is never turned into a grade.
- If no AI answers, the student rates themselves against the note's key points.
- It is presented as an AI judgement, not a mark, and it does not change card schedules: an essay-level score does not say which cards were recalled.

## Where in the code

- `lib/learner/teachback.ts`
- `app/api/teach/route.ts`
- `components/teach/TeachBack.tsx`

## Sources

- Preparing to teach — https://eric.ed.gov/?id=EJ1414484
