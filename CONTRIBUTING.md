# Contributing to Study Coach

Thanks for helping. Bug reports, course formats the app reads badly, and small focused pull
requests are all welcome.

## Getting started

```bash
npm install
npm run dev     # http://localhost:3000
npm test
npm run lint
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first: it explains vaults, units,
assessments, nodes and cards, and the learning-science rules every feature follows.

To keep your own study data apart while developing, point the app at a throwaway database:

```bash
STUDY_DB_PATH=/tmp/study-coach-dev.db npm run dev
```

## Ground rules

- **Vaults are read-only.** Never write into a user's notes except through the existing
  opt-in, confirm-each-save paths. Never touch `.obsidian/`.
- **Questions must stand on their own.** Anything that shows or generates a question follows
  [docs/question-rules.md](docs/question-rules.md).
- **Keep the card rules and the note format in step.** If you change `lib/vault/cards/`,
  update [docs/vault-format-prompt.md](docs/vault-format-prompt.md).
- **AI stays optional and cheap.** Prefer code over an AI call. Default to free or small
  models; local models must be 4B parameters or smaller.
- **Privacy first.** No telemetry, analytics or accounts. Nothing leaves the computer except
  AI requests the user switched on.
- **Learning science, not myths.** No "learning style" labels; every study mode makes the
  student answer before seeing the answer.
- **Next.js 16 has breaking changes.** Check `node_modules/next/dist/docs/` before writing
  Next.js code.

## Tests

Pure logic (vault adapters, manifest parsing, the learner model, scheduling) needs Vitest
tests. Each vault style has a tiny sample vault in `tests/fixtures/`; add one if you add a
new style. Never commit real course material, since lecture slides and textbooks are usually
copyrighted.

## Pull requests

- One change per pull request, with a short description of what and why.
- `npm test` and `npm run lint` pass.
- For UI changes, include a screenshot at phone width and desktop width, in light and dark.
- Commit messages: `feat: …`, `fix: …`, `docs: …`, `refactor: …`, `test: …`, `chore: …`.

## Releasing (maintainers)

Bump `version` in `package.json`, then push a tag such as `v0.2.0`. The **Release** workflow
builds the Mac (Apple silicon and Intel) and Windows installers and attaches them to a draft
GitHub release. Check the draft, then publish it.
