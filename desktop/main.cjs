// Study Coach as a desktop app. Electron opens a window and runs the app's own server in the
// background, on this computer only. Everything the web version does works unchanged.
const { app, BrowserWindow, shell, utilityProcess, dialog } = require("electron");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { readEnvFile } = require("./env-file.cjs");

const HOST = "127.0.0.1";
const START_TIMEOUT_MS = 40_000;
const MAX_LOG_BYTES = 5 * 1024 * 1024;
/** Where Homebrew puts the PDF tools; an app opened from Finder does not get these on its PATH. */
const EXTRA_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"];

// For testing: keep a trial run's data apart from the real app data.
if (process.env.STUDY_COACH_DATA_DIR) app.setPath("userData", path.resolve(process.env.STUDY_COACH_DATA_DIR));

let server = null;
let window = null;

function serverDir() {
  return app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "..", ".next", "standalone");
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Resolves once the server answers properly; rejects if it stops first or takes too long. */
function waitUntilUp(url, deadline, stopped) {
  return new Promise((resolve, reject) => {
    let over = false;
    stopped.then((code) => {
      over = true;
      reject(new Error(`The app's engine stopped while starting (code ${code}).`));
    });
    const again = () => (over ? undefined : Date.now() > deadline ? reject(new Error("The app did not start in time.")) : setTimeout(attempt, 250));
    const attempt = () => {
      if (over) return;
      const request = http.get(url, (response) => {
        response.resume();
        // An error page is not "up".
        if (response.statusCode && response.statusCode < 400) resolve();
        else again();
      });
      request.on("error", again);
      request.setTimeout(2000, () => request.destroy());
    };
    attempt();
  });
}

async function startServer() {
  const data = app.getPath("userData");
  fs.mkdirSync(path.join(data, "data"), { recursive: true });
  fs.mkdirSync(path.join(data, "logs"), { recursive: true });
  const port = await freePort();
  const env = {
    ...process.env,
    ...readEnvFile(path.join(data, "settings.env")),
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(port),
    HOSTNAME: HOST,
    // Progress lives in the user's own app-data folder, never inside the app itself.
    STUDY_DB_PATH: path.join(data, "data", "study.db"),
    PATH: [process.env.PATH, ...EXTRA_PATHS].filter(Boolean).join(path.delimiter),
  };
  const logFile = path.join(data, "logs", "server.log");
  // The log starts afresh once it has grown large, so it never fills the disk.
  const grown = fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_BYTES;
  const log = fs.createWriteStream(logFile, { flags: grown ? "w" : "a" });
  server = utilityProcess.fork(path.join(serverDir(), "server.js"), [], { cwd: serverDir(), env, stdio: "pipe", serviceName: "Study Coach server" });
  server.stdout?.pipe(log);
  server.stderr?.pipe(log);
  let started = false;
  const stopped = new Promise((resolve) => {
    server.once("exit", (code) => {
      server = null;
      resolve(code);
      // While starting, the failure is reported once, by whoever is waiting for the start.
      if (started && !app.isQuitting) {
        dialog.showErrorBox("Study Coach stopped", `The app's engine stopped unexpectedly (code ${code}). Open Study Coach again. Details are in ${path.join(data, "logs", "server.log")}.`);
        app.quit();
      }
    });
  });
  const url = `http://${HOST}:${port}`;
  await waitUntilUp(url, Date.now() + START_TIMEOUT_MS, stopped);
  started = true;
  log.write(`Study Coach is running at ${url}\n`);
  return url;
}

function isLocal(target, base) {
  try {
    return new URL(target).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function openOutside(target) {
  // Only ordinary web links leave the app; anything else is ignored.
  if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
}

function createWindow(url) {
  window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 380,
    minHeight: 560,
    title: "Study Coach",
    backgroundColor: "#0b1020",
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isLocal(target, url)) return { action: "allow" };
    openOutside(target);
    return { action: "deny" };
  });
  // Links, and redirects the server sends, stay inside the app; anything else opens in the normal browser.
  const stayInside = (event, target) => {
    if (isLocal(target, url)) return;
    event.preventDefault();
    openOutside(target);
  };
  window.webContents.on("will-navigate", stayInside);
  window.webContents.on("will-redirect", stayInside);
  // The app needs no camera, microphone, location or notifications: every such request is refused.
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, decide) => decide(false));
  window.on("closed", () => { window = null; });
  void window.loadURL(url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let appUrl = null;
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.whenReady().then(async () => {
    try {
      appUrl = await startServer();
      createWindow(appUrl);
    } catch (error) {
      dialog.showErrorBox("Study Coach could not start", String(error?.message ?? error));
      app.quit();
    }
  });
  app.on("activate", () => { if (!window && appUrl) createWindow(appUrl); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", () => {
    app.isQuitting = true;
    server?.kill();
  });
}
