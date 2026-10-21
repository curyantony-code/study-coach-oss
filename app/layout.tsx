import "./globals.css";
import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import { backUpIfDue } from "@/lib/backup/auto";
import { getPins } from "@/lib/menu-pins";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { getActiveContent, getVaults } from "@/lib/vault/active";
import { localToday, nextAssessment } from "@/lib/vault/health";

export const metadata: Metadata = { title: "Study Coach" };


function countdownText(label: string, daysAway: number): string {
  if (daysAway === 0) return `${label} is today`;
  return `${label} in ${daysAway} day${daysAway === 1 ? "" : "s"}`;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The theme is read from a cookie and drawn by the server, so no script has to run before the page appears.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const vaults = getVaults();
  const content = await getActiveContent();
  // Keeps the copy in the student's cloud folder fresh while they study. Does nothing when no folder is set.
  backUpIfDue();
  const active = content?.vault ?? null;
  // Dated from study.yml, or from the course outline when study.yml gives no dates.
  const upcoming = content ? nextAssessment(content.index.assessments, localToday()) : null;

  return (
    <html lang="en" data-theme={theme.shown} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div className="md:flex min-h-screen">
          <Sidebar
            vaults={vaults.map((v) => ({ id: v.id, name: v.name }))}
            activeVaultId={active?.id ?? null}
            courseCode={content?.index.course.code ?? null}
            courseName={content?.index.course.name ?? "No vault yet"}
            countdown={upcoming ? countdownText(upcoming.assessment.label, upcoming.daysAway) : null}
            pins={active ? getPins(active.id) : []}
            theme={theme}
          />
          {/* Keyed by vault: switching vaults restarts whatever tool is open, so it never shows the old course. */}
          <main key={active?.id ?? "none"} data-vault={active?.id ?? ""} className="flex-1 min-w-0 md:ml-56 min-h-screen px-4 py-6 md:p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
