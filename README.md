# Study Coach

Turn your class notes into a study plan that adapts to you.

Give Study Coach your course outline and your lecture slides, PDFs or notes. It breaks the
course into weeks or chapters, finds your tests and exam dates, makes flashcards and practice
questions from your own material, and tells you what to study each day. It notices what you
keep getting wrong, especially the answers you were *sure* about, and brings those back until
they stick.

Everything runs on your own computer. There is no account, and your notes and progress never
leave your machine unless you choose to switch on an AI feature.

## What it does

- **Builds a course from your files.** Start from the course outline, then drop in slides,
  PDFs (scanned ones too) and notes. Study Coach sorts them into weeks/chapters and writes
  study notes and cards. You can also point it at an existing [Obsidian](https://obsidian.md)
  vault.
- **Plans your studying.** Knows your test dates and spreads the work evenly across the days
  you have, across all your courses.
- **Many ways to practise.** Smart session, flashcards, quizzes, matching, write-it-out,
  teach-back, guess-first, timed mock exams.
- **Learns how you learn.** Uses spaced repetition (FSRS) and asks how confident you are
  before showing the answer. Confident mistakes jump the queue.
- **Shows how ready you are.** Readiness for each test, mastery by week/chapter, and a map
  of how your notes connect, coloured by how well you know each part.

The study methods are based on learning research, not "learning styles". See
[docs/learning-science](docs/learning-science/README.md).

## Download and install

Get the latest version from the **[Releases page](../../releases/latest)**:

| Your computer | Download |
|---|---|
| **Mac with Apple Silicon** (M1, M2, M3, M4 or newer) | `Study-Coach-…-Mac-Apple-Silicon.dmg` |
| **Mac with an Intel processor** (most Macs from before 2021) | `Study-Coach-…-Mac-Intel.dmg` |
| **Windows 10 or 11** | `Study-Coach-…-Windows-Setup.exe` |

**Which Mac do I have?** Click the Apple menu  → **About This Mac**. "Chip: Apple M…" means
**Apple Silicon**; "Processor: … Intel …" means **Intel**.

Everything the app needs is included, including the tools that read PDFs and scanned pages.
It runs on macOS 12 (Monterey) or newer, and Windows 10 or 11.

**Mac:** open the `.dmg` and drag Study Coach into Applications. The app isn't signed by
Apple yet, so the first time, **right-click** Study Coach in Applications, choose **Open**,
then **Open** again. If macOS still refuses, go to System Settings → Privacy & Security and
click **Open Anyway**.

**Windows:** run the installer. If SmartScreen warns you, click **More info → Run anyway**.
The app isn't code-signed yet, which is why Windows asks.

### AI features (optional)

Study Coach works without AI. AI adds the tutor chat, teach-back grading, AI quizzes and
better card wording.

**Study Coach does not come with an AI key.** Each person uses their own, so any AI costs are
yours and your notes go only to the provider you pick. To switch AI on, open **Settings → Set up
AI** in the app, paste a key and click Save. There's a free option that takes about 3 minutes.

👉 **[Step-by-step guide with screenshots](docs/ai-setup/README.md)**, written for complete beginners.

## Your data

Your progress, course list and settings are stored in the app's data folder (above). Courses
built from your files are created in `Documents/Study Coach Vaults` by default, as ordinary
Markdown files you can open in any editor or in Obsidian. The **Backup** page can copy
everything to a folder of your choice, such as a cloud drive.

Existing vaults you add are read-only: Study Coach never changes your notes unless you switch
on writing for that vault and confirm each save.

## Run from source (developers)

Needs [Node.js](https://nodejs.org) 22.5 or newer (24 recommended).

```bash
git clone <this repository's URL> study-coach
cd study-coach
npm install
cp .env.example .env.local   # optional: add AI keys
npm run dev
```

Then open http://localhost:3000.

| Command | What it does |
|---|---|
| `npm test` | Run the tests |
| `npm run lint` | Check code style |
| `npm run desktop` | Run as a desktop app (Electron) |
| `npm run desktop:dist` | Build the installer for your own system into `dist/` |
| `docker compose up -d --build` | Run in Docker at http://localhost:3000 (see `docker-compose.yml`) |

How the code is organised: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Want to help? Read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
