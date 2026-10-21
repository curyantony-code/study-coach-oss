// The app's menu: a few groups, each with the tools that belong to it. One list drives the
// sidebar, its sub-menus and the pins, so a tool is named and placed once.
import { PRACTICE_GROUPS } from "./practice-tools";

export interface MenuItem {
  href: string;
  label: string;
  icon: string;
  /** Lightly tested so far: shown with an asterisk. */
  alpha?: boolean;
}

export interface MenuGroup {
  id: string;
  label: string;
  icon: string;
  /** Where the group's own link goes. */
  href: string;
  items: MenuItem[];
}

const tools = (id: string): MenuItem[] => (PRACTICE_GROUPS.find((group) => group.id === id)?.tools ?? []).map(({ href, label, icon, alpha }) => ({ href, label, icon, alpha }));

export const MENU: MenuGroup[] = [
  {
    id: "today", label: "Today", icon: "☀️", href: "/",
    items: [
      { href: "/", label: "Today", icon: "☀️" },
      { href: "/schedule", label: "Schedule", icon: "🗓️", alpha: true },
      { href: "/intake", label: "My plan", icon: "🧭" },
      { href: "/master", label: "All courses", icon: "🌐", alpha: true },
    ],
  },
  {
    id: "study", label: "Study", icon: "🎓", href: "/study",
    items: [
      { href: "/study", label: "Study session", icon: "🎓" },
      { href: "/problems", label: "Problems", icon: "🧮" },
      ...tools("games"),
    ],
  },
  { id: "tests", label: "Tests", icon: "📝", href: "/practice/tests", items: tools("tests") },
  {
    id: "library", label: "Library", icon: "📖", href: "/browse",
    items: [
      { href: "/browse", label: "Notes", icon: "📖" },
      { href: "/map", label: "Map", icon: "🕸️" },
      { href: "/search", label: "Search", icon: "🔍" },
      { href: "/ingest", label: "Read a PDF", icon: "📑", alpha: true },
    ],
  },
  { id: "tutor", label: "Tutor", icon: "💬", href: "/practice/tutor", items: tools("tutor") },
  { id: "progress", label: "Progress", icon: "📈", href: "/progress", items: [{ href: "/progress", label: "Progress", icon: "📈" }] },
  {
    id: "settings", label: "Settings", icon: "⚙️", href: "/vaults",
    items: [
      { href: "/vaults", label: "Vaults", icon: "🗂️" },
      { href: "/setup-ai", label: "Set up AI", icon: "✨" },
      { href: "/build", label: "New course from files", icon: "📥", alpha: true },
      { href: "/backup", label: "Backup", icon: "💾", alpha: true },
    ],
  },
];

export const MAX_PINS = 8;

export function allItems(): MenuItem[] {
  return MENU.flatMap((group) => group.items);
}

export function findItem(href: string): MenuItem | null {
  return allItems().find((item) => item.href === href) ?? null;
}

/** True when `pathname` is this page or a page under it. The home page only matches itself. */
export function isWithin(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The group the current page belongs to: its sub-menu opens by itself. */
export function groupFor(pathname: string): MenuGroup | null {
  // The longest matching address wins, so "/practice/tests" is Tests and not a stray match.
  const matches = MENU.flatMap((group) => [group.href, ...group.items.map((item) => item.href)].filter((href) => isWithin(pathname, href)).map((href) => ({ group, length: href.length })));
  return matches.sort((a, b) => b.length - a.length)[0]?.group ?? null;
}

/** Stored pins made safe: only real menu items, no repeats, no more than the limit. */
export function cleanPins(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  const known = new Set(allItems().map((item) => item.href));
  return [...new Set(stored.filter((href): href is string => typeof href === "string" && known.has(href)))].slice(0, MAX_PINS);
}

/** Pins an item, or unpins it when it is already pinned. A full list is left as it is. */
export function togglePin(pins: string[], href: string): string[] {
  if (pins.includes(href)) return pins.filter((pin) => pin !== href);
  return findItem(href) && pins.length < MAX_PINS ? [...pins, href] : pins;
}
