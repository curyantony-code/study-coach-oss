import { NextResponse } from "next/server";

/** Every JSON route answers with this envelope. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function ok<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, error: null });
}

/** Runs a route handler and turns an unexpected failure into the standard error envelope. */
export async function guarded(what: string, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    console.error(`${what} failed`, error);
    return fail("Something went wrong on this computer while saving or loading. Try again.", 500);
  }
}

export function fail(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True when a request comes from Study Coach's own pages, not from a form on another website. */
export function fromThisApp(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}
