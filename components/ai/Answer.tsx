import type { ReactNode } from "react";
import MathText from "@/components/MathText";

const USAGE_MARKER = /\n__USAGE__\d+\s*$/;
const BULLET = /^\s*([-*•]|\d+[.)])\s+/;
const HEADING = /^(#{1,6})\s+(.+)$/;

const HEADING_STYLE: Record<number, string> = {
  1: "text-lg font-extrabold text-slate-900 mt-5 mb-2 first:mt-0",
  2: "text-base font-bold text-slate-900 mt-5 mb-2 first:mt-0",
  3: "font-semibold text-slate-900 mt-4 mb-1 first:mt-0",
};

/**
 * AI-written text shown safely: headings, paragraphs and simple lists, with maths typeset.
 * The text is never treated as HTML.
 */
export default function Answer({ text }: { text: string }) {
  const lines = text.replace(USAGE_MARKER, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (list.length > 0) {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 mb-3 space-y-1">
          {list.map((item, i) => <li key={i}><MathText text={item} /></li>)}
        </ul>
      );
      list = [];
    }
    if (paragraph.length > 0) {
      blocks.push(<p key={blocks.length} className="mb-3 whitespace-pre-line"><MathText text={paragraph.join("\n")} /></p>);
      paragraph = [];
    }
  };

  for (const line of lines) {
    const heading = line.match(HEADING);
    if (line.trim() === "") {
      flush();
    } else if (heading) {
      flush();
      blocks.push(<p key={blocks.length} className={HEADING_STYLE[Math.min(heading[1].length, 3)]}><MathText text={heading[2]} /></p>);
    } else if (BULLET.test(line)) {
      if (paragraph.length > 0) flush();
      list.push(line.replace(BULLET, ""));
    } else {
      if (list.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return <>{blocks}</>;
}
