# Confidence and calibration

## The principle

Students' sense of what they know tracks what they actually know only weakly (the handover cites r≈.24 for metacomprehension accuracy). Being confident and wrong is the most useful signal a tutor can get.

## What Study Coach does

- Before the answer is shown the student rates their confidence: guessing, fairly sure, or certain.
- The rating changes the schedule: right and certain is spaced furthest, right but guessing comes back sooner.
- A certain-but-wrong answer flags the card; it is put first in the next session until it is answered correctly.
- Progress shows how often each confidence level was right (“when certain, right X%”) and lists the confident misses.

## Where in the code

- `lib/learner/schedule.ts` (`toRating`, `applyAnswer`)
- `lib/learner/insights.ts` (`calibration`)
- `app/progress/page.tsx`

## Sources

- Metacomprehension accuracy — https://eric.ed.gov/?id=EJ1370019
