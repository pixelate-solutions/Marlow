import { describe, expect, it } from "vitest";
import { canTransition } from "./state-machine";

describe("campaign state machine", () => {
  it("allows durable forward transitions and rejects sending directly from discovery", () => {
    expect(canTransition("QUEUED", "SEARCHING_ACCOUNTS")).toBe(true);
    expect(canTransition("DISCOVERING", "SENDING")).toBe(false);
  });
});
