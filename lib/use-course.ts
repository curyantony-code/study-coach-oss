"use client";
import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/api";
import type { TopicChoice, UnitChoice } from "@/lib/course";

export interface PartInfo {
  /** Where the coverage came from, in plain words. */
  basis: string;
  notes: number;
  cards: number;
  examples: number;
}

interface CourseData {
  vaultId: string;
  name: string;
  units: UnitChoice[];
  topics: TopicChoice[];
  parts: { midterm: PartInfo; final: PartInfo };
}

export interface CourseInfo {
  /** Null until loaded, or when no vault has been added. */
  vaultId: string | null;
  name: string;
  units: UnitChoice[];
  /** Notes that can be quizzed one at a time. */
  topics: TopicChoice[];
  /** What a midterm and a final cover; null until loaded. */
  parts: { midterm: PartInfo; final: PartInfo } | null;
  /** The unit's name as the vault calls it; falls back to the id. */
  unitLabel: (id: string | undefined) => string;
  /** Puts unit ids in the course's own order (unknown ids last). */
  inCourseOrder: (ids: string[]) => string[];
}

/** The course being studied, for the practice tools: its name and how it is divided up. */
export function useCourse(): CourseInfo {
  const [data, setData] = useState<CourseData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/course")
      .then((r) => r.json() as Promise<ApiResponse<CourseData>>)
      .then((body) => {
        if (!cancelled && body.success && body.data) setData(body.data);
      })
      // The tools still work without it: unit ids are shown instead of names.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const units = data?.units ?? [];
    const position = new Map(units.map((u, i) => [u.id, i]));
    return {
      vaultId: data?.vaultId ?? null,
      name: data?.name ?? "",
      units,
      topics: data?.topics ?? [],
      parts: data?.parts ?? null,
      unitLabel: (id) => (id ? units.find((u) => u.id === id)?.label ?? id : ""),
      inCourseOrder: (ids) => [...ids].sort((a, b) => (position.get(a) ?? units.length) - (position.get(b) ?? units.length) || a.localeCompare(b)),
    };
  }, [data]);
}
