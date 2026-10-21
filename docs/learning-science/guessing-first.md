# Guessing first

## The principle

Trying to answer before being taught (a “prequestion”) improves later memory for the material, provided the correct answer follows; the handover cites g≈0.34–0.54 with feedback.

## What Study Coach does

- In a Smart session a card never seen before is asked as an unaided guess: no hint and no confidence rating.
- The answer is shown straight afterwards, next to the guess, and the student marks whether the guess was right.
- A wrong guess is expected; the card returns later in the same session as ordinary recall.

## Where in the code

- `lib/learner/session.ts` (`askKindFor`)
- `components/study/StudySession.tsx`

## Sources

- Prequestion / guessing meta-analysis — https://www.researchgate.net/publication/373448447_Guessing_as_a_learning_intervention_A_meta-analytic_review_of_the_prequestion_effect
