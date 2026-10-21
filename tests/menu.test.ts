import { describe, expect, it } from "vitest";
import { allItems, cleanPins, groupFor, isWithin, MAX_PINS, MENU, togglePin } from "@/lib/menu";

describe("the menu", () => {
  it("has a handful of groups and lists every tool exactly once", () => {
    expect(MENU.map((group) => group.label)).toEqual(["Today", "Study", "Tests", "Library", "Tutor", "Progress", "Settings"]);
    const hrefs = allItems().map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of ["/quiz", "/exam", "/test", "/learn", "/write", "/match", "/arcade", "/chat", "/teach", "/notes", "/ingest", "/backup", "/schedule", "/problems"]) expect(hrefs).toContain(href);
  });

  it("knows which group a page belongs to", () => {
    expect(groupFor("/")?.id).toBe("today");
    expect(groupFor("/schedule")?.id).toBe("today");
    expect(groupFor("/problems/abc123")?.id).toBe("study");
    expect(groupFor("/exam/ai")?.id).toBe("tests");
    expect(groupFor("/practice/tests")?.id).toBe("tests");
    expect(groupFor("/ingest/view")?.id).toBe("library");
    expect(groupFor("/vaults/review")?.id).toBe("settings");
    expect(groupFor("/master")?.id).toBe("today");
    expect(groupFor("/nowhere")).toBeNull();
    expect(isWithin("/study", "/")).toBe(false);
  });
});

describe("pins", () => {
  it("pins and unpins", () => {
    expect(togglePin([], "/quiz")).toEqual(["/quiz"]);
    expect(togglePin(["/quiz", "/map"], "/quiz")).toEqual(["/map"]);
  });

  it("ignores things that are not menu items and stops at the limit", () => {
    expect(togglePin([], "https://elsewhere.example")).toEqual([]);
    const full = allItems().slice(0, MAX_PINS).map((item) => item.href);
    const extra = allItems()[MAX_PINS].href;
    expect(togglePin(full, extra)).toEqual(full);
  });

  it("cleans whatever was stored", () => {
    expect(cleanPins(["/quiz", "/quiz", "/gone", 7, "/map"])).toEqual(["/quiz", "/map"]);
    expect(cleanPins("not a list")).toEqual([]);
    expect(cleanPins(allItems().map((item) => item.href))).toHaveLength(MAX_PINS);
  });
});
