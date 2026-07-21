import { describe, expect, it } from "vitest";
import { isRetryableWorkerError } from "./retry";

describe("worker retry classification", () => {
  it("does not retry deterministic database shape errors", () => {
    expect(
      isRetryableWorkerError(new Error('invalid input syntax for type integer: "0.7"'), 1),
    ).toBe(false);
  });

  it("retries transient service errors while attempts remain", () => {
    expect(isRetryableWorkerError(new Error("Request timed out."), 1)).toBe(true);
  });

  it("stops after the maximum number of attempts", () => {
    expect(isRetryableWorkerError(new Error("Request timed out."), 5)).toBe(false);
  });
});
