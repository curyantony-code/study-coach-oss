import type { ReactNode } from "react";
import MathText from "@/components/MathText";

const FIGURE = /^!\[([^\]]*)\]\(figure:([\w.-]+)\)$/;

function cells(line: string): string[] {
  // "\|" is a literal bar inside a cell.
  return line.replace(/^\|/, "").replace(/\|\s*$/, "").split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

/**
 * Shows one page read from a PDF: paragraphs, headings, lists, rebuilt tables and saved
 * figures. The text is never treated as HTML.
 */
export default function PageMarkdown({ markdown, figureBase }: { markdown: string; figureBase: string }) {
  const blocks: ReactNode[] = [];
  markdown.split(/\n{2,}/).forEach((block, i) => {
    const text = block.trim();
    if (!text) return;
    const figure = text.match(FIGURE);
    if (figure) {
      blocks.push(
        <figure key={i} className="my-4">
          {/* A picture cut from the student's own PDF, served by this app. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${figureBase}&name=${encodeURIComponent(figure[2])}`} alt={figure[1].replace(/\\\$/g, "$") || "Figure from the PDF"} loading="lazy" className="max-w-full rounded-xl border border-slate-200 bg-white" />
          {figure[1] && <figcaption className="mt-1.5 text-xs text-slate-500"><span className="font-semibold">On the figure:</span> <MathText text={figure[1]} /></figcaption>}
        </figure>
      );
    } else if (text.startsWith("|")) {
      const [head, , ...rows] = text.split("\n");
      const header = cells(head);
      blocks.push(
        <div key={i} className="my-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-sm">
            {header.some(Boolean) && (
              <thead>
                <tr>{header.map((cell, c) => <th key={c} scope="col" className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-right font-semibold text-slate-700 first:text-left">{cell && <MathText text={cell} />}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {cells(row).map((cell, c) => c === 0
                    ? <th key={c} scope="row" className="border-b border-slate-100 px-3 py-1.5 text-left font-medium text-slate-800">{cell && <MathText text={cell} />}</th>
                    : <td key={c} className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums text-slate-700 whitespace-nowrap">{cell && <MathText text={cell} />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (text.startsWith("### ")) {
      blocks.push(<h3 key={i} className="mt-5 mb-2 text-base font-bold text-slate-900 first:mt-0"><MathText text={text.slice(4)} /></h3>);
    } else if (text.startsWith("- ")) {
      blocks.push(<ul key={i} className="mb-3 list-disc pl-5"><li><MathText text={text.slice(2)} /></li></ul>);
    } else {
      blocks.push(<p key={i} className="mb-3 text-slate-800"><MathText text={text} /></p>);
    }
  });
  return <>{blocks}</>;
}
