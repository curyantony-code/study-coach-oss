// Study Coach never ships with an AI key: every person uses their own. This check fails a
// build that would carry a settings file or anything that looks like a real key.
import fs from "node:fs";
import path from "node:path";

/** Shapes of real keys from the providers the app talks to. */
export const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, // Anthropic
  /sk-or-v1-[A-Za-z0-9]{20,}/, // OpenRouter
  /sk-(proj-)?[A-Za-z0-9_-]{32,}/, // OpenAI
  /AIza[0-9A-Za-z_-]{35}/, // Google (YouTube)
];
const TEXT_FILE = /\.(m?js|cjs|json|html|txt|rsc|map|env)$/i;

/** Names a key pattern found in `text`, or null. */
export function findKey(text) {
  const hit = KEY_PATTERNS.find((pattern) => pattern.test(text));
  return hit ? hit.source : null;
}

/** Every problem under `dir`: settings files that must not ship, and files holding a key. node_modules is third-party code and is skipped. */
export function scanForKeys(dir) {
  const problems = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "cache") walk(full);
      } else if (/^\.env(\..+)?$/.test(entry.name) || entry.name === "settings.env") {
        problems.push(`${full}: settings file must not ship`);
      } else if (TEXT_FILE.test(entry.name)) {
        const found = findKey(fs.readFileSync(full, "utf-8"));
        if (found) problems.push(`${full}: looks like an API key (${found})`);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return problems;
}

// Run directly: node scripts/no-keys.mjs <folder>
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const dir = path.resolve(process.argv[2] ?? ".next");
  const problems = scanForKeys(dir);
  if (problems.length > 0) {
    console.error(`Refusing to ship: ${problems.length} problem(s) in ${dir}\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`No API keys or settings files in ${dir}.`);
}
