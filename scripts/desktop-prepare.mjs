// Builds the app's server in its self-contained form and puts the files it needs beside it,
// ready for Electron to run (npm run desktop) or to package (npm run desktop:pack).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { scanForKeys } from "./no-keys.mjs";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");

// On Windows the command is npx.cmd, which only runs through a shell.
execFileSync("npx", ["next", "build"], { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, BUILD_STANDALONE: "1", NEXT_TELEMETRY_DISABLED: "1" } });
if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("The self-contained build was not produced.");

fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
// The Mac's text reader, for reading the pictures inside PDFs. Built here when Swift is available.
if (process.platform === "darwin") {
  try {
    fs.mkdirSync(path.join(root, "native", "bin"), { recursive: true });
    // Built for macOS 12 (the oldest the app's Electron supports), not just the build machine's version.
    const target = `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos12`;
    execFileSync("swiftc", ["-O", "-target", target, path.join(root, "native", "mac-text-reader.swift"), "-o", path.join(root, "native", "bin", "mac-text-reader")], { stdio: "inherit" });
    fs.cpSync(path.join(root, "native", "bin"), path.join(standalone, "native", "bin"), { recursive: true });
  } catch (error) {
    console.warn("The Mac text reader was not built, so the app will fall back to Tesseract:", error.message);
  }
}
// The build copies the project's own data and settings files along; a packaged app must not carry them.
for (const leftover of ["data", "desktop", "scripts", "tests", "dist", "coverage"]) fs.rmSync(path.join(standalone, leftover), { recursive: true, force: true });
// Every person uses their own AI key, so no settings file of any kind may ship.
for (const name of fs.readdirSync(standalone)) if (/^\.env(\..+)?$/.test(name)) fs.rmSync(path.join(standalone, name), { force: true });
const leaks = scanForKeys(standalone);
if (leaks.length > 0) throw new Error(`Refusing to package an app that carries keys or settings:\n${leaks.join("\n")}`);
// Bundled PDF tools (scripts/bundle-tools.mjs). Without them the app still runs and uses any installed copy.
const tools = path.join(root, "vendor", "tools", "bin");
if (!fs.existsSync(tools)) {
  fs.mkdirSync(tools, { recursive: true });
  console.warn("No bundled PDF tools in vendor/tools: this build relies on Poppler and Tesseract being installed. Release builds bundle them.");
}
console.log(`Ready: ${standalone}`);
