// Where a link from the all-courses overview may lead: only to an address inside this app.

/**
 * Returns `to` as a path inside the app, or "/" when it would lead anywhere else. The address
 * is resolved the way a browser resolves it and then compared, because browsers ignore tabs
 * and line breaks inside an address: "/\t/evil.example" is read as "//evil.example".
 */
export function insidePath(to: string | null | undefined): string {
  if (!to || !to.startsWith("/") || /[\u0000-\u0020\\]/.test(to)) return "/";
  const base = "http://app.invalid";
  try {
    const target = new URL(to, base);
    return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : "/";
  } catch {
    return "/";
  }
}
