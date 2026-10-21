// Starts the server inside a packaged app, exactly as shipped, and loads real pages. Catches
// anything that only works on the build machine (missing files, links to its own folders).
//
//   node scripts/smoke-packaged.mjs            (after electron-builder has written dist/)
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const PORT = 3977;
const PAGES = ["/", "/vaults", "/setup-ai", "/build", "/ingest", "/study"];
const START_TIMEOUT_MS = 60_000;

/** The packaged app's own Electron (run as plain Node) and its server folder. */
function packagedApp() {
  for (const dir of fs.readdirSync(dist)) {
    const app = path.join(dist, dir, "Study Coach.app");
    if (fs.existsSync(app)) return { exe: path.join(app, "Contents", "MacOS", "Study Coach"), server: path.join(app, "Contents", "Resources", "server"), tools: path.join(app, "Contents", "Resources", "tools") };
    const win = path.join(dist, dir, "Study Coach.exe");
    if (fs.existsSync(win)) return { exe: win, server: path.join(dist, dir, "resources", "server"), tools: path.join(dist, dir, "resources", "tools") };
  }
  throw new Error(`No packaged app found in ${dist}`);
}

function get(pathname) {
  return new Promise((resolve) => {
    const request = http.get({ host: "127.0.0.1", port: PORT, path: pathname, headers: { host: "localhost" } }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.on("error", () => resolve(0));
    request.setTimeout(30_000, () => request.destroy());
  });
}

const app = packagedApp();
const data = fs.mkdtempSync(path.join(os.tmpdir(), "study-coach-smoke-"));
const output = [];
const server = spawn(app.exe, [path.join(app.server, "server.js")], {
  cwd: app.server,
  env: {
    ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production", PORT: String(PORT), HOSTNAME: "127.0.0.1",
    STUDY_DB_PATH: path.join(data, "study.db"), STUDY_SETTINGS_FILE: path.join(data, "settings.env"),
    PATH: [path.join(app.tools, "bin"), process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32") : "/usr/bin:/bin"].join(path.delimiter),
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  },
});
server.stdout.on("data", (chunk) => output.push(String(chunk)));
server.stderr.on("data", (chunk) => output.push(String(chunk)));

let failed = false;
try {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while ((await get("/vaults")) === 0) {
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("The packaged server did not start.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  for (const page of PAGES) {
    const status = await get(page);
    console.log(`${page} → ${status}`);
    if (status === 0 || status >= 500) failed = true;
  }
} catch (error) {
  console.error(error.message);
  failed = true;
} finally {
  server.kill();
}
if (failed) {
  console.error(`The packaged app is broken. Its server said:\n${output.join("").slice(-4000)}`);
  process.exit(1);
}
console.log(`The packaged app (${path.relative(root, app.exe)}) starts and serves every page checked.`);
