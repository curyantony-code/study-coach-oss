// The user's own AI keys, kept in a plain KEY=VALUE file on their computer: settings.env in
// the desktop app's data folder, or .env.local when running from source. The Set up AI page
// reads and writes it here. Only the keys listed below can ever be written.
import fs from "fs";
import path from "path";

export type KeyName = "OPENROUTER_API_KEY" | "YOUTUBE_API_KEY" | "ANTHROPIC_API_KEY" | "OPENAI_API_KEY";

export interface KeySpec {
  name: KeyName;
  /** What the key unlocks, in plain words. */
  label: string;
  /** Rough shape of a real key, so a typo is caught before it is saved. */
  shape: RegExp;
  /** How a real key starts, shown when the shape is wrong. */
  startsWith: string;
}

export const KEY_SPECS: readonly KeySpec[] = [
  { name: "OPENROUTER_API_KEY", label: "OpenRouter", shape: /^sk-or-v1-[A-Za-z0-9]{20,}$/, startsWith: "sk-or-v1-" },
  { name: "YOUTUBE_API_KEY", label: "YouTube", shape: /^AIza[0-9A-Za-z_-]{35}$/, startsWith: "AIza" },
  { name: "ANTHROPIC_API_KEY", label: "Claude (Anthropic)", shape: /^sk-ant-[A-Za-z0-9_-]{20,}$/, startsWith: "sk-ant-" },
  { name: "OPENAI_API_KEY", label: "OpenAI", shape: /^sk-[A-Za-z0-9_-]{20,}$/, startsWith: "sk-" },
];

export function specFor(name: string): KeySpec | null {
  return KEY_SPECS.find((spec) => spec.name === name) ?? null;
}

/** Trims what was pasted: spaces, quotes, and a "KEY=" the user may have copied along. */
export function cleanPasted(name: KeyName, pasted: string): string {
  return pasted.trim().replace(new RegExp(`^${name}\\s*=\\s*`), "").replace(/^(["'])(.*)\1$/, "$2").trim();
}

/** Null when the key looks right; otherwise a sentence saying what is wrong. */
export function shapeProblem(spec: KeySpec, value: string): string | null {
  if (!value) return "Paste your key into the box first.";
  if (/\s/.test(value)) return "The key has a space in it. Copy it again with the copy button on the website.";
  if (!value.startsWith(spec.startsWith)) return `This doesn’t look like a ${spec.label} key: those start with “${spec.startsWith}”. Check you copied the whole key from the right website.`;
  if (!spec.shape.test(value)) return `That doesn't look like a complete ${spec.label} key. Copy it again with the copy button on the website.`;
  return null;
}

/** The values set in a KEY=VALUE text. Comments and blank lines are skipped. */
export function parseSettings(text: string): Record<string, string> {
  const entries = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.indexOf("=") > 0)
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2")] as const);
  return Object.fromEntries(entries);
}

/** A copy of `text` with `name` set to `value` (or removed when null). Every other line is kept as it was. */
export function withSetting(text: string, name: KeyName, value: string | null): string {
  const isLine = (line: string) => new RegExp(`^\\s*${name}\\s*=`).test(line);
  const lines = text.split(/\r?\n/);
  const firstAt = lines.findIndex(isLine);
  const kept = lines.filter((line) => !isLine(line));
  const placed = value !== null && firstAt >= 0 ? [...kept.slice(0, firstAt), `${name}=${value}`, ...kept.slice(firstAt)] : kept;
  const body = placed.join("\n").replace(/\n+$/, "");
  const appended = value !== null && firstAt < 0 ? [body, `${name}=${value}`].filter(Boolean).join("\n") : body;
  return appended ? `${appended}\n` : "";
}

/** "••••abcd": enough to recognise a key without showing it. */
export function masked(value: string): string {
  return `••••${value.slice(-4)}`;
}

/**
 * Where keys are saved. The desktop app names its settings.env file; running from source
 * uses .env.local. Null in Docker and other production servers, whose settings are edited
 * outside the app.
 */
export function settingsFilePath(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | null {
  if (env.STUDY_SETTINGS_FILE) return path.resolve(env.STUDY_SETTINGS_FILE);
  return env.NODE_ENV === "production" ? null : path.join(cwd, ".env.local");
}

export function readSettingsText(file: string): string {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    // No file yet is normal: no key has been added.
    return "";
  }
}

/** Saves one key (or removes it), readable only by this user, and makes it live in this process. */
export function saveSetting(file: string, name: KeyName, value: string | null): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = withSetting(readSettingsText(file), name, value);
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, next, { encoding: "utf-8", mode: 0o600 });
  fs.renameSync(temporary, file);
  if (value === null) delete process.env[name];
  else process.env[name] = value;
}
