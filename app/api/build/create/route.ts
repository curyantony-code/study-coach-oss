import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, fromThisApp, guarded, ok } from "@/lib/api";
import { buildCourse } from "@/lib/build/service";
import { cleanCourse } from "@/lib/build/tags";

const bodySchema = z.object({ course: z.string().min(1).max(20) });

/** Creates the vault for one course from its checked files. */
export function POST(request: Request) {
  return guarded("Building a course", async () => {
    if (!fromThisApp(request)) return fail("That request did not come from Study Coach.", 403);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    const course = parsed.success ? cleanCourse(parsed.data.course) : null;
    if (!course) return fail("Choose a course first.");
    const built = await buildCourse(course);
    if ("error" in built) return fail(built.error);
    revalidatePath("/", "layout");
    return ok(built);
  });
}
