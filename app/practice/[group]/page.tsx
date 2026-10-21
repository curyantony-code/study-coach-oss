import Link from "next/link";
import { notFound } from "next/navigation";
import { ALPHA_NOTE, PRACTICE_GROUPS, practiceGroup } from "@/lib/practice-tools";

export function generateStaticParams() {
  return PRACTICE_GROUPS.map((group) => ({ group: group.id }));
}

export default async function PracticeHub({ params }: { params: Promise<{ group: string }> }) {
  const group = practiceGroup((await params).group);
  if (!group) notFound();
  const hasAlpha = group.tools.some((tool) => tool.alpha);

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-3xl font-extrabold gradient-text mb-1">{group.label}</h1>
      <p className="text-slate-500 text-sm mb-8">{group.intro}</p>
      <ul className="space-y-3">
        {group.tools.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="group flex items-start gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            >
              <span className="text-2xl leading-none pt-0.5" aria-hidden="true">{tool.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold text-slate-900 group-hover:text-blue-700">
                  {tool.label}
                  {tool.alpha && <abbr title={ALPHA_NOTE} className="ml-0.5 text-amber-600 no-underline" aria-label="lightly tested">*</abbr>}
                </span>
                <span className="mt-0.5 block text-sm text-slate-600">{tool.what}</span>
                <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">Use it when</span>
                <span className="block text-sm text-slate-700">{tool.when}</span>
              </span>
              <span className="self-center text-slate-300 group-hover:text-blue-500" aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
      {hasAlpha && <p className="mt-6 text-xs text-slate-500"><span className="font-bold text-amber-600">*</span> {ALPHA_NOTE}</p>}
    </div>
  );
}
