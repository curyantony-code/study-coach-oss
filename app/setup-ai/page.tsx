import { removeKeyAction } from "@/app/setup-ai/actions";
import KeyForm from "@/components/setup-ai/KeyForm";
import { smallLocalModel } from "@/lib/ai/local-models";
import { KEY_SPECS, masked, parseSettings, readSettingsText, settingsFilePath, specFor, type KeyName } from "@/lib/ai/settings-file";

export const dynamic = "force-dynamic";

const GUIDE_URL = "https://github.com/curyantony-code/study-coach-oss/blob/main/docs/ai-setup/README.md";
const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const LINK_BUTTON = "inline-flex items-center gap-1 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 active:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const REMOVE = "rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 underline hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const LINK = "font-semibold text-blue-700 underline hover:text-blue-900";

interface Service {
  key: KeyName;
  step: number;
  title: string;
  price: { text: string; tone: "free" | "paid" };
  unlocks: string;
  getUrl: string;
  getLabel: string;
  steps: string[];
}

const SERVICES: Service[] = [
  {
    key: "OPENROUTER_API_KEY", step: 1, title: "Free AI for everything (OpenRouter)",
    price: { text: "Free", tone: "free" },
    unlocks: "The tutor chat, AI quizzes, Test Me, teach-back grading and better card wording. Uses free AI models, so it costs nothing.",
    getUrl: "https://openrouter.ai/keys", getLabel: "Open OpenRouter",
    steps: [
      "Click “Open OpenRouter” and sign in. The easiest way is the Google button (the coloured G).",
      "Click “Create API Key”. Type any name, such as Study Coach, and click Create.",
      "Click the copy button next to the key, come back here, paste it below and click Save.",
    ],
  },
  {
    key: "YOUTUBE_API_KEY", step: 2, title: "Video suggestions (YouTube)",
    price: { text: "Free", tone: "free" },
    unlocks: "Finds and ranks short YouTube videos that explain the topic you are studying. Without it you still get ready-made YouTube searches.",
    getUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", getLabel: "Open Google Cloud",
    steps: [
      "Click “Open Google Cloud” and sign in with a Google account. If asked, agree to the terms and create a project (any name).",
      "Click the blue Enable button for “YouTube Data API v3”.",
      "In the menu, go to APIs & Services → Credentials → Create credentials → API key. Copy the key, paste it below and click Save.",
    ],
  },
  {
    key: "ANTHROPIC_API_KEY", step: 3, title: "Best quality (Claude)",
    price: { text: "Paid, about $5 to start", tone: "paid" },
    unlocks: "Optional. Claude gives the most careful tutor answers and grading. When this key is set, Study Coach uses Claude instead of the free models.",
    getUrl: "https://platform.claude.com/settings/keys", getLabel: "Open Claude Console",
    steps: [
      "Click “Open Claude Console” and choose “Continue with Google” (or use your email). Then add credit under Billing; the smallest amount is fine to start.",
      "Under API keys, click “Create Key”, give it a name and click Create.",
      "Copy the key right away (it is shown only once), paste it below and click Save.",
    ],
  },
];

function Status({ value }: { value: string | undefined }) {
  return value
    ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">✓ Connected {masked(value)}</span>
    : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Not set up</span>;
}

function ServiceCard({ service, saved, canSave }: { service: Service; saved: string | undefined; canSave: boolean }) {
  const spec = specFor(service.key)!;
  const headingId = `setup-${service.key}`;
  return (
    <section aria-labelledby={headingId} className={CARD}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-extrabold text-white">{service.step}</span>
          <div>
            <h2 id={headingId} className="text-lg font-bold text-slate-900">{service.title}</h2>
            <p className={`text-xs font-bold uppercase tracking-wide ${service.price.tone === "free" ? "text-emerald-700" : "text-amber-700"}`}>{service.price.text}</p>
          </div>
        </div>
        <Status value={saved} />
      </div>
      <p className="mt-3 text-sm text-slate-600">{service.unlocks}</p>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
        {service.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <div className="mt-4">
        <a href={service.getUrl} target="_blank" rel="noopener noreferrer" className={LINK_BUTTON}>{service.getLabel} ↗</a>
      </div>
      {canSave && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <KeyForm name={spec.name} label={spec.label} startsWith={spec.startsWith} hasKey={Boolean(saved)} />
          {saved && (
            <form action={removeKeyAction} className="mt-2">
              <input type="hidden" name="name" value={spec.name} />
              <button type="submit" className={REMOVE}>Remove this key from Study Coach</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

export default async function SetupAiPage() {
  const file = settingsFilePath();
  const saved = file ? parseSettings(readSettingsText(file)) : {};
  const value = (name: KeyName) => saved[name] || process.env[name] || undefined;
  const localModel = await smallLocalModel();
  const ready = KEY_SPECS.some((spec) => value(spec.name)) || Boolean(localModel);

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold gradient-text mb-1">Set up AI</h1>
        <p className="text-slate-600 text-sm">
          AI is optional: flashcards, quizzes, your plan and progress all work without it. Study Coach doesn&apos;t come with an AI account.
          You connect your own, so you stay in control of any cost. <strong>Start with step 1. It&apos;s free and takes about 3 minutes.</strong>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Want pictures of every click? Open the <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className={LINK}>step-by-step guide with screenshots ↗</a>.
        </p>
      </header>

      <div role="status" className={`rounded-2xl border p-4 text-sm ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
        {ready ? "AI is ready to use. You can add more services below at any time." : "No AI connected yet. Follow step 1 below to switch on the AI features for free."}
      </div>

      {!file && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Keys can&apos;t be saved from this page in this setup. If you run Study Coach in Docker, put the keys in <code>.env.local</code> next to <code>docker-compose.yml</code> and restart it.
        </p>
      )}

      {SERVICES.map((service) => <ServiceCard key={service.key} service={service} saved={value(service.key)} canSave={Boolean(file)} />)}

      <section aria-labelledby="setup-ollama" className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-700 text-sm font-extrabold text-white">4</span>
            <div>
              <h2 id="setup-ollama" className="text-lg font-bold text-slate-900">AI without the internet (Ollama)</h2>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Free · no key needed · for newer computers</p>
            </div>
          </div>
          {localModel
            ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">✓ Found {localModel}</span>
            : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Not found</span>}
        </div>
        <p className="mt-3 text-sm text-slate-600">Optional. Runs a small AI on your own computer, so it works offline and nothing leaves your machine. It is slower and simpler than the online options, and needs about 3 GB of space.</p>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          <li>Click “Download Ollama”, then the small “Download manually” link, and pick Mac or Windows. Install it and open it once.</li>
          <li>Open <strong>Terminal</strong> (Mac) or <strong>Command Prompt</strong> (Windows), paste <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">ollama pull llama3.2</code> and press Enter. Wait for it to finish.</li>
          <li>Come back here and reload this page. It should say “Found”.</li>
        </ol>
        <div className="mt-4"><a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer" className={LINK_BUTTON}>Download Ollama ↗</a></div>
      </section>

      <details className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">Other options and where keys are kept</summary>
        <div className="mt-3 space-y-3">
          {file && (
            <div>
              <p className="mb-2">Already pay for OpenAI? An OpenAI key can stand in for OpenRouter.</p>
              <KeyForm name="OPENAI_API_KEY" label="OpenAI" startsWith="sk-" hasKey={Boolean(value("OPENAI_API_KEY"))} />
            </div>
          )}
          <p>Your keys are saved only on this computer{file ? <>, in <code className="break-all">{file}</code></> : null}. They are sent only to the service they belong to. To delete a key for good, delete it on that service&apos;s website too.</p>
        </div>
      </details>
    </div>
  );
}

