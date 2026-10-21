import { fail, fromThisApp, guarded, ok } from "@/lib/api";
import { tagRound } from "@/lib/build/service";

/** Tags the next few files in the inbox and reports how many are done. */
export function POST(request: Request) {
  return guarded("Tagging files", async () => {
    if (!fromThisApp(request)) return fail("That request did not come from Study Coach.", 403);
    return ok(await tagRound());
  });
}
