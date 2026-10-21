// Reads the student's own settings file (AI keys and the like): one KEY=VALUE per line.
// The file lives in their app-data folder and is never bundled with the app.
const fs = require("fs");

function parseEnv(text) {
  const pairs = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.indexOf("=") > 0);
  return Object.fromEntries(
    pairs.map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2")])
  );
}

/** Missing or unreadable is normal: the app then runs without AI keys. */
function readEnvFile(file) {
  try {
    return parseEnv(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

module.exports = { parseEnv, readEnvFile };
