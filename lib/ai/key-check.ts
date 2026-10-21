// Tries a key the user pasted before it is saved, with the cheapest request each provider
// offers (listing models, or one tiny YouTube lookup). Nothing is generated and nothing costs
// money; the only question asked is "does this key work?".
import type { KeyName } from "./settings-file";

const TIMEOUT_MS = 12_000;
/** Any public video id: the lookup only checks that the key is accepted. */
const SAMPLE_VIDEO = "jNQXAC9IVRw";

export type KeyCheck =
  | { status: "works" }
  | { status: "rejected"; message: string }
  | { status: "unknown"; message: string };

interface Probe {
  url: string;
  headers: Record<string, string>;
}

function probeFor(name: KeyName, key: string): Probe {
  switch (name) {
    case "OPENROUTER_API_KEY":
      return { url: "https://openrouter.ai/api/v1/key", headers: { Authorization: `Bearer ${key}` } };
    case "ANTHROPIC_API_KEY":
      return { url: "https://api.anthropic.com/v1/models?limit=1", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
    case "OPENAI_API_KEY":
      return { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${key}` } };
    case "YOUTUBE_API_KEY":
      return { url: `https://www.googleapis.com/youtube/v3/videos?part=id&id=${SAMPLE_VIDEO}&key=${encodeURIComponent(key)}`, headers: {} };
  }
}

/** Google says why a key failed in the body: an API that is not switched on is the usual case. */
async function youtubeCheck(response: Response): Promise<KeyCheck> {
  const text = await response.text().catch(() => "");
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(text)) {
    return { status: "unknown", message: "Saved. One more step: in Google Cloud, “YouTube Data API v3” is not switched on for this key yet. Open it from the guide's YouTube step, click Enable, and wait a minute." };
  }
  if (/API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|API_KEY_SERVICE_BLOCKED/i.test(text)) {
    return { status: "rejected", message: "This key has restrictions that block Study Coach. In Google Cloud, edit the key and set “Application restrictions” to None." };
  }
  return { status: "rejected", message: "Google did not accept this key. Copy it again from Google Cloud → Credentials." };
}

export async function checkKey(name: KeyName, key: string, fetchFn: typeof fetch = fetch): Promise<KeyCheck> {
  const probe = probeFor(name, key);
  let response: Response;
  try {
    response = await fetchFn(probe.url, { headers: probe.headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { status: "unknown", message: "Could not reach the provider to try the key (is the internet connected?). It was saved anyway; it will be used once you are online." };
  }
  if (response.ok) return { status: "works" };
  if (name === "YOUTUBE_API_KEY" && (response.status === 400 || response.status === 403)) return youtubeCheck(response);
  if (response.status === 401 || response.status === 403) return { status: "rejected", message: "The provider says this key is not valid. Copy it again from their website (it may have been deleted or mistyped)." };
  if (response.status === 402) return { status: "unknown", message: "The key was saved, but the account has no credit yet. Add credit on the provider’s website, or use the free OpenRouter option instead." };
  if (response.status === 429) return { status: "unknown", message: "The provider is busy right now, so the key could not be tried. It was saved anyway." };
  return { status: "unknown", message: `The provider answered with an unexpected error (${response.status}), so the key could not be tried. It was saved anyway.` };
}
