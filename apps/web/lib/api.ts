import { toErrorResponse } from "@marlow/shared";
import { NextResponse } from "next/server";

export function apiError(error: unknown): NextResponse {
  if (process.env.NODE_ENV !== "test" && !(error instanceof Error && error.name === "AppError")) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "API request failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  const response = toErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export function apiOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}
