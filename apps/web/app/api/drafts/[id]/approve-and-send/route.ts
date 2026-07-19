import { z } from "zod";
import { AppError } from "@marlow/shared";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { assertCsrf, enforceRateLimit } from "@/lib/security";
import { approveAndSend } from "@/lib/send";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ mailboxId: z.string().trim().min(1).max(200) });
const keySchema = z.string().trim().min(16).max(200);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin", "member"]);
    const { id } = await params;
    const { mailboxId } = bodySchema.parse(await request.json());
    const parsedKey = keySchema.safeParse(request.headers.get("idempotency-key"));
    if (!parsedKey.success)
      throw new AppError("VALIDATION_ERROR", "A stable Idempotency-Key header is required.", 400);
    if (!isDemoMode())
      await enforceRateLimit(
        createSupabaseAdminClient(),
        auth.organizationId,
        `approve-send:${auth.userId}`,
        20,
        60,
      );
    const result = await approveAndSend({
      auth,
      draftId: id,
      mailboxId,
      idempotencyKey: parsedKey.data,
    });
    return apiOk(result, { status: result.status === "SENDING" ? 202 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
