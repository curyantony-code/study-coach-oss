// Opens every page of a running Study Coach, for every course, and reports the ones that
// misbehave. Run with Electron against a development copy:
//
//   STUDY_URL=http://localhost:3100 npx electron scripts/check-pages.cjs
//
// Three layers, cheapest first, the same shape the app uses for its own AI work:
//   RULES   code visits each page, opens its menus and folds, and records hard facts:
//           console errors, failed requests, crashes, the developer error overlay, and
//           tell-tale text ("undefined", "NaN", "Invalid Date").
//   ROUTER  a small model on this computer reads each page's text and says whether it
//           reads like a broken page. A second opinion, never a verdict.
//   nothing is submitted: forms and buttons that change data are left alone.
const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = (process.env.STUDY_URL || "http://localhost:3100").replace(/\/$/, "");
const OUT = process.env.CHECK_OUT || path.join(os.tmpdir(), "study-coach-page-check.json");
const MAX_PAGES_PER_COURSE = Number(process.env.CHECK_MAX_PAGES || 70);
const SETTLE_MS = 900;
/** The small local model that gives a second opinion: CHECK_MODEL names one, "off" skips it, otherwise the largest installed model of 4B parameters or fewer. */
let MODEL = process.env.CHECK_MODEL === "off" ? null : process.env.CHECK_MODEL || null;
const MAX_MODEL_PARAMETERS = 4e9;
const OLLAMA = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/v1\/?$/, "");
/** Addresses that are never followed: they download, change the course, or leave the page list. */
const SKIP = [/^\/api\//, /^\/master\/go/, /\/export/, /^\/_next\//];
/** Noise from the development server itself, not from the app. */
const IGNORED_CONSOLE = [/webpack-hmr/, /\[Fast Refresh\]/, /Download the React DevTools/, /\[HMR\]/, /Electron Security Warning/];
const BAD_TEXT = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /Invalid Date/, /Application error/i, /This page could not be found/i, /Unhandled Runtime Error/i, /(^|[.!?] )Something went wrong/];

app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "study-coach-check-")));
app.disableHardwareAcceleration();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function courses() {
  const response = await fetch(`${BASE}/vaults`);
  const html = await response.text();
  // The vault picker lists every course with its id.
  const found = [...html.matchAll(/<option value="([0-9a-f-]{36})"[^>]*>([^<]+)<\/option>/g)].map((m) => ({ id: m[1], name: m[2] }));
  return [...new Map(found.map((course) => [course.id, course])).values()];
}

/** Runs in the page: what is on it, and where it links. */
const INSPECT = `(() => {
  const overlay = document.querySelector("nextjs-portal");
  const overlayText = overlay && overlay.shadowRoot ? (overlay.shadowRoot.querySelector("[data-nextjs-dialog], [data-nextjs-toast-errors-parent], [data-issues]")?.textContent || "").slice(0, 400) : "";
  const main = document.querySelector("main");
  return {
    title: (document.querySelector("h1")?.textContent || "").trim().slice(0, 80),
    text: (main ? main.innerText : document.body.innerText).replace(/\\s+/g, " ").trim().slice(0, 2400),
    mainLength: main ? main.innerText.trim().length : 0,
    overlay: overlayText,
    links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/")),
    brokenImages: [...document.images].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.getAttribute("src")).slice(0, 5),
  };
})()`;

/** Runs in the page: opens what can be opened without changing anything. Returns how many things it pressed. */
const OPEN_THINGS = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let pressed = 0;
  for (const el of [...document.querySelectorAll('main details:not([open]) > summary, aside button[aria-expanded="false"], main button[aria-expanded="false"]')].slice(0, 25)) {
    if (el.closest("form")) continue;
    el.click(); pressed++; await wait(40);
  }
  return pressed;
})()`;

async function askModel(title, text) {
  if (!MODEL || text.length < 40) return null;
  try {
    const response = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: MODEL, stream: false, format: "json", options: { temperature: 0 },
        messages: [
          { role: "system", content: 'You check web pages of a study app for visible faults. You are given the text shown on one page. Reply with JSON only: {"broken": true|false, "reason": "<at most 15 words>"}. A page is broken ONLY if its text shows a fault a student would notice: an error message, raw code or markup shown as text, placeholder words like "undefined" or "NaN", the same sentence repeated many times by mistake, or sentences cut off mid-word. A page that is empty because the student has not done anything yet, or that says a course has no outline, is NOT broken. Short pages and lists of numbers are NOT broken. When unsure, answer false.' },
          { role: "user", content: `Page heading: ${title || "(none)"}\n\nPage text:\n${text.slice(0, 1500)}` },
        ],
      }),
    });
    const reply = JSON.parse((await response.json()).message.content);
    return reply && typeof reply.broken === "boolean" ? { broken: reply.broken, reason: String(reply.reason || "").slice(0, 140) } : null;
  } catch {
    return null;
  }
}

async function visit(window, state, pathname) {
  state.console = [];
  state.failed = [];
  const started = Date.now();
  let loadError = null;
  try {
    await window.loadURL(`${BASE}${pathname}`);
  } catch (error) {
    // A redirect while loading is reported as an aborted load; the page that arrives is what counts.
    if (!/ERR_ABORTED/.test(String(error))) loadError = String(error.message || error).slice(0, 160);
  }
  await sleep(SETTLE_MS);
  const before = await window.webContents.executeJavaScript(INSPECT).catch((error) => ({ title: "", text: "", mainLength: 0, overlay: "", links: [], brokenImages: [], scriptError: String(error).slice(0, 160) }));
  const pressed = await window.webContents.executeJavaScript(OPEN_THINGS).catch(() => 0);
  if (pressed > 0) await sleep(500);
  const after = pressed > 0 ? await window.webContents.executeJavaScript(INSPECT).catch(() => before) : before;

  const problems = [];
  if (loadError) problems.push({ kind: "did not load", detail: loadError });
  if (before.scriptError) problems.push({ kind: "page script failed", detail: before.scriptError });
  for (const entry of state.console) problems.push({ kind: entry.level === "error" ? "console error" : "console warning", detail: entry.message });
  for (const entry of state.failed) problems.push({ kind: `request failed (${entry.status})`, detail: entry.url });
  if (after.overlay) problems.push({ kind: "developer error overlay", detail: after.overlay });
  for (const src of after.brokenImages) problems.push({ kind: "picture did not load", detail: src });
  if (after.mainLength < 20) problems.push({ kind: "page is empty", detail: `${after.mainLength} characters of content` });
  for (const pattern of BAD_TEXT) {
    const found = after.text.match(pattern);
    if (found) problems.push({ kind: "suspicious text", detail: `"${after.text.slice(Math.max(0, found.index - 50), found.index + 60)}"` });
  }
  return { path: pathname, finalPath: new URL(window.webContents.getURL()).pathname + new URL(window.webContents.getURL()).search, title: after.title, ms: Date.now() - started, pressed, problems, links: [...before.links, ...after.links], text: after.text };
}

function normalise(href) {
  try {
    const url = new URL(href, BASE);
    if (url.origin !== new URL(BASE).origin) return null;
    const pathname = url.pathname + url.search;
    return SKIP.some((pattern) => pattern.test(url.pathname)) ? null : pathname;
  } catch {
    return null;
  }
}

/** One example of each kind of page is enough: 40 problems or 60 notes are the same page with different text. */
function family(pathname) {
  const [p, query = ""] = pathname.split("?");
  const parts = p.split("/").filter(Boolean);
  const shape = parts.length > 1 && !["practice", "exam", "master", "study", "ingest", "vaults"].includes(parts[0]) ? `/${parts[0]}/*` : p.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, "*");
  const keys = [...new URLSearchParams(query).keys()].sort().join(",");
  return `${shape}?${keys}`;
}

async function pickModel() {
  if (MODEL || process.env.CHECK_MODEL === "off") return MODEL;
  try {
    const tags = await (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2000) })).json();
    const sized = (tags.models || []).flatMap((m) => {
      const found = /^([\d.]+)\s*([BM])$/i.exec(m.details?.parameter_size || "");
      const count = found ? Number(found[1]) * (found[2].toUpperCase() === "B" ? 1e9 : 1e6) : null;
      return count !== null && count <= MAX_MODEL_PARAMETERS && m.size > 0 && !/embed|code|-cloud$/i.test(m.name) ? [{ name: m.name, count }] : [];
    });
    return sized.sort((a, b) => b.count - a.count)[0]?.name ?? null;
  } catch {
    return null;
  }
}

app.whenReady().then(async () => {
  MODEL = await pickModel();
  process.stdout.write(`Second opinion from: ${MODEL ?? "no small local model (skipped)"}\n`);
  const window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { sandbox: true, contextIsolation: true } });
  const state = { console: [], failed: [] };
  window.webContents.on("console-message", (event) => {
    const { level, message } = event;
    if ((level === "error" || level === "warning") && !IGNORED_CONSOLE.some((pattern) => pattern.test(message))) state.console.push({ level, message: String(message).slice(0, 300) });
  });
  session.defaultSession.webRequest.onCompleted((details) => {
    if (details.statusCode >= 400 && !/webpack-hmr|__nextjs/.test(details.url)) state.failed.push({ status: details.statusCode, url: details.url.replace(BASE, "").slice(0, 160) });
  });

  const report = { base: BASE, model: MODEL, startedAt: new Date().toISOString(), courses: [] };
  const list = await courses();
  for (const course of list) {
    await session.defaultSession.cookies.set({ url: BASE, name: "sc_vault", value: course.id });
    const queue = ["/", "/master", "/master?view=week", "/master?view=topic", "/study", "/schedule", "/problems", "/map", "/progress", "/browse", "/vaults", `/vaults/${course.id}`, `/vaults/review?vault=${course.id}`, "/backup", "/build", "/ingest", "/search", "/intake", "/quiz", "/exam", "/exam/ai", "/test", "/learn", "/write", "/match", "/arcade", "/chat", "/teach", "/notes", "/practice/tests", "/practice/games", "/practice/tutor", "/study/session?scope=course&mode=smart"];
    const seen = new Set();
    const families = new Map();
    const pages = [];
    while (queue.length > 0 && pages.length < MAX_PAGES_PER_COURSE) {
      const next = queue.shift();
      if (seen.has(next)) continue;
      seen.add(next);
      const kind = family(next);
      // At most two of each kind of page per course.
      if ((families.get(kind) ?? 0) >= 2) continue;
      families.set(kind, (families.get(kind) ?? 0) + 1);
      const page = await visit(window, state, next);
      const opinion = await askModel(page.title, page.text);
      if (opinion?.broken) page.problems.push({ kind: "small model thinks it looks broken", detail: opinion.reason });
      for (const href of page.links) {
        const target = normalise(href);
        if (target && !seen.has(target)) queue.push(target);
      }
      pages.push({ path: page.path, finalPath: page.finalPath, title: page.title, ms: page.ms, pressed: page.pressed, problems: page.problems });
      process.stdout.write(`${course.name.slice(0, 18).padEnd(18)} ${String(pages.length).padStart(3)} ${page.problems.length ? "!" : " "} ${next.slice(0, 70)}\n`);
    }
    report.courses.push({ id: course.id, name: course.name, pages });
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.stdout.write(`\nWrote ${OUT}\n`);
  app.quit();
});
