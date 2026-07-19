import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isDemoMode } from "@/lib/auth";
import { runFollowUpSweep } from "@/lib/follow-ups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function hasValidCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function GET(request: Request) {
  if (!hasValidCronSecret(request))
    return NextResponse.json(
      { error: { code: "AUTHENTICATION_REQUIRED", message: "Cron authorization failed." } },
      { status: 401 },
    );
  if (isDemoMode())
    return NextResponse.json({
      data: { checked: 0, replied: 0, draftsCreated: 0, errors: 0 },
    });
  try {
    const result = await runFollowUpSweep();
    return NextResponse.json({ data: result });
  } catch (error) {
    return apiError(error);
  }
}
