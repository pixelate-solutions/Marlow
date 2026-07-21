import { describe, expect, it } from "vitest";
import { qualificationBatches } from "./orchestrator";

describe("qualification batches", () => {
  it("keeps model qualification requests within the configured batch size", () => {
    const items = Array.from({ length: 25 }, (_, index) => index + 1);

    const result = qualificationBatches(items);

    expect(result).toHaveLength(3);
    expect(result.map((batch) => batch.length)).toEqual([12, 12, 1]);
    expect(result.flat()).toEqual(items);
  });
});
