import { getDb } from "@/lib/db/client";
import { insidePath } from "@/lib/master/go";
import { ACTIVE_VAULT_COOKIE } from "@/lib/vault/active";
import { getVault } from "@/lib/vault/registry";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Opens a page inside one course from the all-courses overview: switches to that course,
 * then goes to the page. Only addresses inside this app are followed, and only when the
 * request comes from the app itself, since it changes which course is being studied.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const fromElsewhere = request.headers.get("sec-fetch-site") === "cross-site";
  const vault = fromElsewhere ? null : getVault(getDb(), url.searchParams.get("vault") ?? "");
  // A relative address: it cannot point anywhere but this app, whatever host name the server thinks it has.
  const headers = new Headers({ Location: vault ? insidePath(url.searchParams.get("to")) : "/master", "Cache-Control": "no-store" });
  if (vault) headers.append("Set-Cookie", `${ACTIVE_VAULT_COOKIE}=${encodeURIComponent(vault.id)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 307, headers });
}
