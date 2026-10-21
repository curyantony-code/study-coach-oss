// The practice tools, grouped by what the student is trying to do. One list drives the menu
// and the three hub pages, so a tool is described once.

export interface PracticeTool {
  href: string;
  label: string;
  icon: string;
  /** One line: what it does. */
  what: string;
  /** One line: when to reach for it rather than its neighbours. */
  when: string;
  /** Lightly tested so far: shown with an asterisk. */
  alpha?: boolean;
}

export interface PracticeGroup {
  id: "tests" | "games" | "tutor";
  label: string;
  icon: string;
  intro: string;
  tools: PracticeTool[];
}

export const PRACTICE_GROUPS: PracticeGroup[] = [
  {
    id: "tests",
    label: "Quizzes & exams",
    icon: "📝",
    intro: "Check what you know under test conditions. Shortest first.",
    tools: [
      { href: "/quiz", label: "Quiz", icon: "📝", what: "Ten or so multiple-choice questions on one topic or note, from your cards or newly written by AI.", when: "A quick check after studying a topic.", alpha: true },
      { href: "/exam", label: "Mock exam", icon: "⏱️", what: "A timed paper mixed across units, with no feedback until the end. Includes the AI Midterm and Final.", when: "In the week or two before a test.", alpha: true },
      { href: "/test", label: "Test Me", icon: "🧪", what: "A longer diagnostic with written answers that the AI marks, to find what you do not know yet.", when: "At the start of revising, to decide where to spend time.", alpha: true },
    ],
  },
  {
    id: "games",
    label: "Card games",
    icon: "🎯",
    intro: "Four ways through the same flashcards. Every answer counts toward your progress.",
    tools: [
      { href: "/learn", label: "Learn", icon: "🧠", what: "Flip each card and say whether you knew it. Missed cards come back.", when: "First pass through new material." },
      { href: "/write", label: "Write", icon: "✍️", what: "Type the answer from memory and have it checked.", when: "When recognising the answer is easy but recalling it is not." },
      { href: "/match", label: "Match", icon: "🎯", what: "Pair terms with their meanings against the clock.", when: "A short warm-up." },
      { href: "/arcade", label: "Arcade", icon: "🕹️", what: "Fast multiple choice with a score and a streak.", when: "When you have five minutes and little energy." },
    ],
  },
  {
    id: "tutor",
    label: "AI tutor",
    icon: "💬",
    intro: "Ask, explain and summarise, grounded in your own notes.",
    tools: [
      { href: "/chat", label: "Chat", icon: "💬", what: "Ask anything about the course. Answers come from your notes.", when: "You are stuck on one idea." },
      { href: "/teach", label: "Teach back", icon: "🗣️", what: "Explain a topic in your own words and get told what you left out.", when: "You think you understand something and want proof." },
      { href: "/notes", label: "Notes", icon: "📄", what: "A study sheet on a topic, short or detailed.", when: "You want one page to read before a test." },
    ],
  },
];

export function practiceGroup(id: string): PracticeGroup | null {
  return PRACTICE_GROUPS.find((group) => group.id === id) ?? null;
}

export const ALPHA_NOTE = "Lightly tested so far. It works, but expect rough edges.";
