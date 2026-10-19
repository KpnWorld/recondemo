/**
 * Errors thrown by services. `code` is stable for tests and API clients;
 * `message` is safe to show to the person who triggered it.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "INVALID_TRANSITION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "NOT_CONFIGURED"
  | "PAYMENT_ERROR"
  | "INTEGRATION_ERROR";

const HTTP: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  PAYMENT_ERROR: 402,
  INTEGRATION_ERROR: 502,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "AppError";
  }
  get httpStatus() {
    return HTTP[this.code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/** Result shape used by server actions so forms can render errors without throwing. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | {
      ok: false;
      error: string;
      code?: ErrorCode;
      fieldErrors?: Record<string, string[] | undefined>;
    };

export function toActionError(e: unknown): Extract<ActionResult, { ok: false }> {
  if (isAppError(e))
    return {
      ok: false,
      error: e.message,
      code: e.code,
      fieldErrors: e.fieldErrors,
    };
  console.error("[unexpected error]", e);
  return {
    ok: false,
    error: "Something went wrong on our side. Please try again, or contact support if it keeps happening.",
  };
}
