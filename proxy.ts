import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Study Coach can read any folder its owner registers, so it only answers requests
 * addressed to this computer. This blocks other websites from reaching it through a
 * hostname that secretly points at 127.0.0.1 (DNS rebinding).
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  if (LOCAL_HOSTNAMES.has(hostname)) return NextResponse.next();
  return new NextResponse("Study Coach only answers on this computer (http://localhost).", { status: 403 });
}
