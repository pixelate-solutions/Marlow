import type { ApiErrorCode } from "./schemas";

export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toErrorResponse(error: unknown): {
  status: number;
  body: { error: { code: ApiErrorCode; message: string; details?: Record<string, unknown> } };
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
  };
}
