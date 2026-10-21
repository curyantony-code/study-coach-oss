// Copies the PDF tools (Poppler) and the text reader for scanned pages (Tesseract) out of a
// conda-forge environment into vendor/tools, so the desktop app carries them and friends
// install nothing else. conda-forge builds run on older macOS and Windows versions, and
// their libraries find each other relative to the program, so the folder can move as-is.
//
//   micromamba create -p .tools-env -c conda-forge poppler tesseract
//   node scripts/bundle-tools.mjs .tools-env
//
// Result: vendor/tools/{bin,lib,share/tessdata}, THIRD-PARTY-NOTICES.md and licenses/.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const prefix = path.resolve(process.argv[2] ?? process.env.CONDA_PREFIX ?? "");
const out = path.join(root, "vendor", "tools");
const windows = process.platform === "win32";
const TOOLS = ["pdftotext", "pdfinfo", "pdftoppm", "pdftohtml", "pdfimages", "tesseract"];
const LANGUAGES = ["eng.traineddata", "osd.traineddata"];
/** conda-forge puts Windows programs under Library\. */
const base = windows ? path.join(prefix, "Library") : prefix;

if (!fs.existsSync(path.join(prefix, "conda-meta"))) throw new Error(`Not a conda environment: ${prefix}`);
fs.rmSync(out, { recursive: true, force: true });
for (const dir of ["bin", "lib", "share/tessdata", "licenses"]) fs.mkdirSync(path.join(out, dir), { recursive: true });

/** Copies a file, resolving symlinks, and keeps it executable. */
function copy(from, to) {
  fs.copyFileSync(fs.realpathSync(from), to);
  fs.chmodSync(to, 0o755);
}

/** macOS: the libraries a file loads that live in the environment (system ones are already on every Mac). */
function macDependencies(file) {
  return execFileSync("otool", ["-L", file], { encoding: "utf-8" })
    .split("\n").slice(1)
    .map((line) => line.trim().split(" (")[0])
    .filter((name) => name.startsWith("@rpath/") || name.startsWith(prefix))
    .map((name) => path.join(prefix, "lib", path.basename(name)));
}

/** Linux: the same, read from ldd. */
function linuxDependencies(file) {
  return execFileSync("ldd", [file], { encoding: "utf-8" })
    .split("\n")
    .map((line) => line.match(/=>\s+(\S+)/)?.[1])
    .filter((name) => name && name.startsWith(prefix));
}

function bundleUnix() {
  const queue = TOOLS.map((tool) => path.join(prefix, "bin", tool));
  const seen = new Set();
  for (const tool of queue.splice(0)) {
    if (!fs.existsSync(tool)) throw new Error(`Missing in the environment: ${tool}`);
    copy(tool, path.join(out, "bin", path.basename(tool)));
    queue.push(tool);
  }
  // Every library the tools need, and every library those need, until none are new.
  while (queue.length > 0) {
    const file = queue.shift();
    const needs = process.platform === "darwin" ? macDependencies(file) : linuxDependencies(file);
    for (const lib of needs) {
      if (seen.has(lib)) continue;
      seen.add(lib);
      if (!fs.existsSync(lib)) throw new Error(`${path.basename(file)} needs ${lib}, which is missing`);
      copy(lib, path.join(out, "lib", path.basename(lib)));
      queue.push(lib);
    }
  }
  return seen.size;
}

/** Windows: programs find their DLLs in their own folder, so the tools and the environment's DLLs go side by side. */
function bundleWindows() {
  const bin = path.join(base, "bin");
  for (const tool of TOOLS) {
    const exe = path.join(bin, `${tool}.exe`);
    if (!fs.existsSync(exe)) throw new Error(`Missing in the environment: ${exe}`);
    copy(exe, path.join(out, "bin", `${tool}.exe`));
  }
  const dlls = fs.readdirSync(bin).filter((name) => name.toLowerCase().endsWith(".dll"));
  for (const dll of dlls) copy(path.join(bin, dll), path.join(out, "bin", dll));
  return dlls.length;
}

/** Finds a file anywhere under `dir` (conda-forge puts tessdata in different places per system). */
function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory() && !entry.isSymbolicLink() && entry.name !== "conda-meta" && entry.name !== "pkgs") {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}

/** English text and page-orientation data for Tesseract; the official small models when the package has none. */
async function bundleLanguages() {
  for (const name of LANGUAGES) {
    const target = path.join(out, "share", "tessdata", name);
    const found = findFile(prefix, name);
    if (found) {
      fs.copyFileSync(found, target);
      continue;
    }
    const url = `https://github.com/tesseract-ocr/tessdata_fast/raw/main/${name}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not get ${name} from ${url}: ${response.status}`);
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    console.log(`Downloaded ${name} from tessdata_fast (Apache-2.0)`);
  }
}

/** The notice every release carries: what is bundled, its license, and where its source is. */
function writeNotices() {
  const packages = fs.readdirSync(path.join(prefix, "conda-meta"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(prefix, "conda-meta", name), "utf-8")))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rows = packages.map((p) => `| ${p.name} | ${p.version} | ${p.license ?? "see package"} | https://github.com/conda-forge/${p.name}-feedstock |`);
  for (const p of packages) {
    const licenseDir = path.join(prefix, "pkgs", `${p.name}-${p.version}-${p.build}`, "info", "licenses");
    const extracted = p.extracted_package_dir ? path.join(p.extracted_package_dir, "info", "licenses") : licenseDir;
    if (fs.existsSync(extracted)) fs.cpSync(extracted, path.join(out, "licenses", p.name), { recursive: true });
  }
  fs.writeFileSync(path.join(out, "THIRD-PARTY-NOTICES.md"), [
    "# Third-party tools bundled with Study Coach",
    "",
    "Study Coach's desktop app includes these separate programs and the libraries they use, unchanged,",
    "as built by conda-forge (https://conda-forge.org). Study Coach runs them as separate programs to read PDFs.",
    "Their licenses are in the `licenses` folder next to this file. Each one's source code, including the exact",
    "build recipe, is available from its conda-forge feedstock below and from the project itself",
    "(Poppler: https://poppler.freedesktop.org, Tesseract: https://github.com/tesseract-ocr/tesseract).",
    "",
    "| Package | Version | License | Source and build recipe |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n"));
}

const libraries = windows ? bundleWindows() : bundleUnix();
await bundleLanguages();
writeNotices();
console.log(`Bundled ${TOOLS.length} tools and ${libraries} libraries into ${out}`);
