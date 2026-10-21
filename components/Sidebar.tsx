"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { togglePinAction } from "@/app/menu/actions";
import { switchVaultAction } from "@/app/vaults/actions";
import Mascot from "@/components/Mascot";
import StreakBadge from "@/components/StreakBadge";
import ThemeToggle from "@/components/ThemeToggle";
import { findItem, groupFor, isWithin, MAX_PINS, MENU, type MenuGroup, type MenuItem } from "@/lib/menu";
import { ALPHA_NOTE } from "@/lib/practice-tools";
import type { Theme } from "@/lib/theme";

export interface SidebarVault {
  id: string;
  name: string;
}

export interface SidebarProps {
  vaults: SidebarVault[];
  activeVaultId: string | null;
  courseCode: string | null;
  courseName: string;
  /** e.g. "Midterm in 9 days", or null when no dated assessment is coming up. */
  countdown: string | null;
  /** Addresses of the menu items pinned for the course being studied. */
  pins: string[];
  /** The colour theme the server drew the page in. */
  theme: Theme;
}

const ROW = "flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const IDLE = "text-slate-500 hover:text-slate-800 hover:bg-white hover:shadow-sm";
const CURRENT = "bg-blue-500 text-white shadow-sm";

function Alpha({ active }: { active: boolean }) {
  return <abbr title={ALPHA_NOTE} aria-label="lightly tested" className={`ml-0.5 no-underline ${active ? "text-white" : "text-amber-600"}`}>*</abbr>;
}

/** Pins an item to the top of the menu for this course, or takes it off. */
function PinButton({ item, pinned, full }: { item: MenuItem; pinned: boolean; full: boolean }) {
  const blocked = !pinned && full;
  return (
    <form action={togglePinAction} className="shrink-0">
      <input type="hidden" name="href" value={item.href} />
      <button
        type="submit"
        disabled={blocked}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label} for this course`}
        title={blocked ? `You can pin up to ${MAX_PINS} items` : pinned ? "Unpin" : "Pin for this course"}
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-30 ${
          pinned ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:bg-white hover:text-slate-600"
        }`}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M5.2 1.8h5.6l-.8 4.3 2.6 2.7H3.4L6 6.1z" />
          <path d="M8 8.8v5.4" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}

function ItemRow({ item, pathname, pins, compact = false }: { item: MenuItem; pathname: string; pins: string[]; compact?: boolean }) {
  const active = isWithin(pathname, item.href);
  return (
    <li className="flex items-center gap-1">
      <Link href={item.href} aria-current={active ? "page" : undefined} className={`${ROW} min-w-0 flex-1 ${compact ? "px-2.5 py-1.5" : "px-3 py-2"} ${active ? CURRENT : IDLE}`}>
        <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>
        <span className="truncate">{item.label}{item.alpha && <Alpha active={active} />}</span>
      </Link>
      <PinButton item={item} pinned={pins.includes(item.href)} full={pins.length >= MAX_PINS} />
    </li>
  );
}

function Pinned({ pins, pathname, prefix }: { pins: string[]; pathname: string; prefix: string }) {
  const items = pins.flatMap((href) => findItem(href) ?? []);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={`${prefix}-pinned`} className="mb-3">
      <h2 id={`${prefix}-pinned`} className="px-3 mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">Pinned for this course</h2>
      <ul className="space-y-0.5">{items.map((item) => <ItemRow key={item.href} item={item} pathname={pathname} pins={pins} />)}</ul>
    </section>
  );
}

/** A group: its own link, and a sub-menu of everything in it that opens beside it. */
function Group({ group, pathname, pins, open, onToggle, prefix }: { group: MenuGroup; pathname: string; pins: string[]; open: boolean; onToggle: () => void; prefix: string }) {
  const here = groupFor(pathname)?.id === group.id;
  const single = group.items.length === 1;
  const panel = `${prefix}-menu-${group.id}`;
  return (
    <li>
      <div className="flex items-center gap-1">
        <Link href={group.href} aria-current={here && (single || !open) ? "page" : undefined} className={`${ROW} min-w-0 flex-1 px-3 py-2 ${here && (single || !open) ? CURRENT : here ? "text-slate-900 font-semibold" : IDLE}`}>
          <span className="text-base leading-none" aria-hidden="true">{group.icon}</span>
          <span className="truncate">{group.label}{group.items.some((item) => item.alpha) && <Alpha active={here && (single || !open)} />}</span>
        </Link>
        {single ? (
          <PinButton item={group.items[0]} pinned={pins.includes(group.items[0].href)} full={pins.length >= MAX_PINS} />
        ) : (
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panel} aria-label={`${open ? "Hide" : "Show"} what is in ${group.label}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
          </button>
        )}
      </div>
      {!single && open && (
        <ul id={panel} className="mt-0.5 mb-1 ml-4 space-y-0.5 border-l border-blue-100 pl-2">
          {group.items.map((item) => <ItemRow key={item.href} item={item} pathname={pathname} pins={pins} compact />)}
        </ul>
      )}
    </li>
  );
}

/** The groups, with the one for the current page open. Opening or closing a group by hand sticks until the page changes group. */
/** `prefix` keeps the ids apart: the menu is on the page twice, once for wide screens and once for phones. */
function Groups({ pins, prefix }: { pins: string[]; prefix: string }) {
  const pathname = usePathname();
  const current = groupFor(pathname)?.id ?? null;
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => choices[id] ?? id === current;
  return (
    <>
      <Pinned pins={pins} pathname={pathname} prefix={prefix} />
      <ul className="space-y-0.5">
        {MENU.map((group) => (
          <Group key={group.id} group={group} pathname={pathname} pins={pins} prefix={prefix} open={isOpen(group.id)} onToggle={() => setChoices((now) => ({ ...now, [group.id]: !isOpen(group.id) }))} />
        ))}
      </ul>
    </>
  );
}

/** The choice in the vault list that opens the overview of every course. */
const ALL_COURSES = "__all__";

function VaultSwitcher({ vaults, activeVaultId, id }: Pick<SidebarProps, "vaults" | "activeVaultId"> & { id: string }) {
  const onMaster = usePathname().startsWith("/master");
  if (vaults.length === 0) {
    return (
      <Link href="/vaults" className="block rounded-xl border border-dashed border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        + Add a vault
      </Link>
    );
  }
  return (
    <form action={switchVaultAction}>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
        Vault
      </label>
      {onMaster && <input type="hidden" name="from" value="master" />}
      <select
        id={id}
        name="vaultId"
        defaultValue={onMaster ? ALL_COURSES : activeVaultId ?? undefined}
        key={`${activeVaultId}${onMaster}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded-xl border border-blue-200 bg-white px-2.5 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {vaults.length > 1 && <option value={ALL_COURSES}>★ All courses (overview)</option>}
        {vaults.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
    </form>
  );
}

function Brand({ courseCode, courseName }: Pick<SidebarProps, "courseCode" | "courseName">) {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-xl min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <Mascot mood="idle" size={40} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest truncate">{courseCode ?? "Study Coach"}</div>
        <div className="text-sm font-bold text-slate-800 leading-tight line-clamp-2">{courseName}</div>
      </div>
    </Link>
  );
}

function AlphaLegend() {
  return <p className="px-3 pt-2 text-[11px] leading-snug text-slate-500"><span className="font-bold text-amber-600">*</span> Lightly tested so far</p>;
}

function Countdown({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs font-semibold text-amber-800">{text}</div>;
}

/** Wide screens: a fixed sidebar. */
function DesktopSidebar({ vaults, activeVaultId, courseCode, courseName, countdown, pins, theme }: SidebarProps) {
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col py-5 px-3 fixed top-0 left-0 h-full z-20 border-r border-blue-100 overflow-y-auto" style={{ background: "var(--sidebar-bg)" }}>
      <div className="px-2 mb-4"><Brand courseCode={courseCode} courseName={courseName} /></div>
      <div className="px-2 mb-4 space-y-2">
        <VaultSwitcher vaults={vaults} activeVaultId={activeVaultId} id="vault-switcher" />
        <Countdown text={countdown} />
      </div>
      <div className="px-2 mb-4"><StreakBadge size="sm" /></div>
      <nav aria-label="Main"><Groups pins={pins} prefix="side" /></nav>
      <div className="mt-auto pt-4">
        <AlphaLegend />
        <div className="mt-2 border-t border-blue-100 pt-3"><ThemeToggle initial={theme} /></div>
      </div>
    </aside>
  );
}

/** Phones and narrow windows: a top bar with the pinned items (or the main groups), and the full menu behind "Menu". */
function MobileBar({ vaults, activeVaultId, courseCode, courseName, countdown, pins, theme }: SidebarProps) {
  const pathname = usePathname();
  const pinned = pins.flatMap((href) => findItem(href) ?? []);
  const shortcuts: MenuItem[] = pinned.length > 0 ? pinned : MENU.slice(0, 5).map(({ href, label, icon }) => ({ href, label, icon }));
  return (
    <header className="md:hidden sticky top-0 z-20 border-b border-blue-100 px-4 pt-3 pb-2" style={{ background: "var(--sidebar-bg)" }}>
      <div className="flex items-center justify-between gap-3">
        <Brand courseCode={courseCode} courseName={courseName} />
        <div className="w-36 shrink-0"><VaultSwitcher vaults={vaults} activeVaultId={activeVaultId} id="vault-switcher-mobile" /></div>
      </div>
      {countdown && <div className="mt-2"><Countdown text={countdown} /></div>}
      <nav aria-label="Shortcuts" className="mt-2 flex gap-1 overflow-x-auto">
        {shortcuts.map((item) => {
          const active = pinned.length > 0 ? isWithin(pathname, item.href) : groupFor(pathname)?.href === item.href;
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`${ROW} shrink-0 px-3 py-2 ${active ? CURRENT : IDLE}`}>
              <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>{item.label}
            </Link>
          );
        })}
      </nav>
      {/* Remounting on navigation closes the menu after a choice. */}
      <details key={pathname} className="mt-1">
        <summary className="cursor-pointer select-none px-3 py-1.5 text-sm font-medium text-slate-500 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Menu</summary>
        <nav aria-label="Full menu" className="pt-1"><Groups pins={pins} prefix="bar" /></nav>
        <AlphaLegend />
        <ThemeToggle initial={theme} />
      </details>
    </header>
  );
}

export default function Sidebar(props: SidebarProps) {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileBar {...props} />
    </>
  );
}
