# Self-testing and spacing

## The principle

Practice testing and distributed (spaced) practice are the two study techniques rated most useful in Dunlosky et al.'s 2013 review, and spaced retrieval is the strongest combination. Successive relearning adds one rule: an item is practised until it is answered correctly, then brought back later.

## What Study Coach does

- Every study mode makes the student produce an answer before seeing it.
- Each card is scheduled with FSRS (`ts-fsrs`): the review comes when recall is predicted to be slipping, about 90% (95% in the two weeks before an assessment).
- A card missed in a session comes back before the session ends, up to twice, so it is answered correctly at least once where possible.
- Only the first answer to a card in a session moves its schedule; the in-session repeats are practice.

## Where in the code

- `lib/learner/schedule.ts`
- `lib/learner/queue.ts`
- `components/study/StudySession.tsx`

## Sources

- Dunlosky et al. 2013 — https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html
- Successive relearning — https://www.retrievalpractice.org/archive/2018/successive-relearning
- Roediger & Karpicke 2006 — https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x
- FSRS — https://github.com/open-spaced-repetition
