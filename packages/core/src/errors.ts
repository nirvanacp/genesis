/** Error codes the host and SDK report to applet code. The Rust `ErrorCode` enum lists the same names. */
export const ERROR_CODES = [
  "RETIRED",
  "CONFLICT",
  "NOT_FOUND",
  "DOCUMENT_TOO_LARGE",
  "STORAGE_FAILURE",
  "ORIGIN_NOT_DECLARED",
  "SNAPSHOT_TOO_LARGE",
  "MESSAGE_TOO_LARGE",
  "DEADLINE",
  "SOURCE_REPLACED",
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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
