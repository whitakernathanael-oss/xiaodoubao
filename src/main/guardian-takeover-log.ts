import type { LogEvent } from "./log";

export function guardianTakeoverFailure(error: unknown): LogEvent {
  return {
    stage: "guardian-takeover",
    errorType: error instanceof Error ? error.name : "unknown",
    status: "failed"
  };
}
