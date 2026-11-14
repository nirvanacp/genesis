/** Error codes the host and SDK report to applet code. The Rust `ErrorCode` enum lists the same names. */
export const ERROR_CODES = [
  "RETIRED",
  "CONFLICT",
  "NOT_FOUND",
  "DOCUMENT_TOO_LARGE",
  "STORAGE_FAILURE",
  "ORIGIN_NOT_DECLARED",
  "MESSAGE_TOO_LARGE",
  "PAGE_TOO_LARGE",
  "PATCH_TOO_LARGE",
  "DEADLINE",
  "INVALID_STEPS",
  "SERVICE_UNREACHABLE",
  "SERVICE_FAILURE",
  "AUTHENTICATION_FAILED",
  "CERTIFICATE_FAILED",
  "CONFIGURATION_REQUIRED",
  "NOT_READY",
  "UNKNOWN_METHOD",
  "INVALID_ARGUMENT",
  "QUOTA_EXCEEDED",
  "PROTOCOL_MISMATCH",
  "APPLET_INCOMPATIBLE",
  "ENVELOPE_INVALID",
  "CONTEXT_REPLACED",
  "TARGET_NOT_FOUND",
  "PRECONDITION_FAILED",
  "ASYNC_READ",
  "AUTH_REQUIRED",
  "REJECTED",
  "NOT_ACTIONABLE",
  "AMBIGUOUS_TARGET",
  "PROTECTED_FIELD",
  "INPUT_UNAVAILABLE",
  "UNKNOWN_OPERATION",
  "USER_ACTION_REQUIRED",
  "FILE_UNAVAILABLE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
