# Sleep and distraction

## The principle

The handover cites a sizeable impairment from sleep loss (g≈0.62) and from phone distraction (g≈−0.65).

## What Study Coach does

- Once a day, before the first session, the app asks how the student slept: one tap, three choices.
- After a bad night, sessions that day are review only: no new cards.
- A session starts with a one-line reminder to put the phone in another room, unless the intake says it already is.
- If the tab is left while a card is on screen, that answer is marked as distracted and the session summary says how often it happened.
- The app records what the student reports. It never infers a health or psychological condition.

## Where in the code

- `components/study/SleepCheckin.tsx`
- `app/api/study/queue/route.ts` (`reviewOnly`)
- `components/study/StudySession.tsx`

## Sources

- Sleep and memory — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8893218/
