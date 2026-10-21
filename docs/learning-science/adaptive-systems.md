# What adaptive systems can claim

## The principle

Intelligent tutoring systems show positive but modest effects on average (the handover cites roughly 0.2–0.4 SD), and simple knowledge-tracing models often do as well as complex ones.

## What Study Coach does

- The app does not claim to raise grades. “Readiness” is described on screen as a forecast from the student's answers, not a grade.
- Every answer is logged with its scope, mode, confidence, response time, and whether a hint was used or the tab was left, so changes can be compared rather than assumed.
- “What makes it stick” on the Progress page only reports a best mode once there are enough later reviews to say.
- The Smart session moves at most 30% of a session toward that mode and never drops self-testing.

## Where in the code

- `lib/db/client.ts` (`attempts`)
- `lib/learner/insights.ts` (`modeResults`)
- `lib/learner/session.ts` (`planKinds`)

## Sources

- Intelligent tutoring systems (Kulik & Fletcher 2016) — https://docs.opendeved.net/lib/2N9LMVR5
- Knowledge tracing comparison (Gervet et al.) — https://files.eric.ed.gov/fulltext/EJ1273917.pdf
