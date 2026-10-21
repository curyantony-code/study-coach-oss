import katex from "katex";
import { Fragment, type ReactNode } from "react";
import { splitMath, unescapeDollars } from "@/lib/mathtext";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]\n]+\]\])/g;

/** Light formatting for the text between formulas: **bold**, `code` and [[wikilinks]] as plain words. */
function formatText(text: string): ReactNode[] {
  return unescapeDollars(text)
    .split(INLINE)
    .map((piece, i) => {
      if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4) return <strong key={i}>{piece.slice(2, -2)}</strong>;
      if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2) {
        return <code key={i} className="rounded bg-slate-100 px-1 text-[0.9em]">{piece.slice(1, -1)}</code>;
      }
      if (piece.startsWith("[[") && piece.endsWith("]]")) {
        const [target, alias] = piece.slice(2, -2).split("|");
        return <Fragment key={i}>{alias ?? target.split("#").pop()}</Fragment>;
      }
      return <Fragment key={i}>{piece}</Fragment>;
    });
}

function renderMath(latex: string, display: boolean): string {
  // throwOnError:false shows an unreadable formula in red instead of breaking the card.
  // The default `trust: false` means a note cannot smuggle links or HTML in through math.
  return katex.renderToString(latex, { displayMode: display, throwOnError: false, output: "htmlAndMathml", strict: "ignore" });
}

/**
 * Shows card or note text with LaTeX drawn as real notation:
 * "$\frac{1}{n}\bar\sigma^2$" becomes a typeset fraction, not backslashes.
 */
export default function MathText({ text }: { text: string }) {
  const parts = splitMath(text);
  // Plain text needs no wrapper; text with math gets one so an over-long formula can scroll.
  if (parts.every((part) => part.kind === "text")) return <>{formatText(text)}</>;
  return (
    <span className="math-text">
      {parts.map((part, i) =>
        part.kind === "text" ? (
          <Fragment key={i}>{formatText(part.value)}</Fragment>
        ) : (
          <span
            key={i}
            className={part.display ? "block my-2 overflow-x-auto" : undefined}
            dangerouslySetInnerHTML={{ __html: renderMath(part.value, part.display) }}
          />
        )
      )}
    </span>
  );
}
