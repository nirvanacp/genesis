import type { CallDetails, ErrorBody, ErrorCode } from "@genesis/core";
import { GenesisError } from "../bridge.js";

/** An error a page operation answers with: a shared error code, and optionally how far it got. */
export class PageError extends GenesisError {
  constructor(code: ErrorCode, message: string, details?: CallDetails) {
    super(code, message, details);
    this.name = "PageError";
  }
}

/** The wire form of any thrown value. Unknown errors become `INVALID_ARGUMENT` with their message. */
export function errorBody(error: unknown): ErrorBody {
  const code = error instanceof GenesisError ? error.code : (error as { code?: ErrorCode })?.code ?? "INVALID_ARGUMENT";
  const body: ErrorBody = { code, message: messageOf(error) };
  if (error instanceof GenesisError && error.details) body.details = error.details;
  return body;
}

export function messageOf(error: unknown): string {
  return String((error as Error)?.message ?? error);
}
