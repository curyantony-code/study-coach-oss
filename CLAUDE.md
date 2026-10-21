@AGENTS.md

Start with `docs/ARCHITECTURE.md` (concepts, vault adapters, learner model, learning-science rules) and `CONTRIBUTING.md` (ground rules).

Project rules that hold for every vault and every feature:
- `docs/question-rules.md`: every question shown or written must be answerable on its own. Read it before touching anything that displays or generates questions.
- `docs/vault-format-prompt.md`: the note format the app reads best. Keep it in step with the card rules in `lib/vault/cards/` when those change.
- Vaults are read-only unless the user switched writing on for that vault; never touch `.obsidian/`.
- Keep AI optional and cheap; local models 4B parameters at most.
