import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { isDemoMode, requireAuth } from "@/lib/auth";
import { setDefaultMailbox, updateMailboxSignature } from "@/lib/mailboxes";
import { assertCsrf } from "@/lib/security";

const updateSchema = z
  .object({
    signatureText: z.string().max(10_000).optional(),
    isDefault: z.literal(true).optional(),
  })
  .refine((input) => input.signatureText !== undefined || input.isDefault === true);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const auth = await requireAuth(["owner", "admin"]);
    const { id } = await params;
    const input = updateSchema.parse(await request.json());
    if (isDemoMode()) return apiOk({ id, ...input, demo: true });
    if (input.signatureText !== undefined)
      await updateMailboxSignature({
        organizationId: auth.organizationId,
        mailboxId: id,
        signatureText: input.signatureText,
      });
    if (input.isDefault)
      await setDefaultMailbox({ organizationId: auth.organizationId, mailboxId: id });
    return apiOk({ id, ...input });
  } catch (error) {
    return apiError(error);
  }
}
