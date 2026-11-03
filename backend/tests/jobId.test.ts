import { buildBullJobId } from "../src/utils/jobId";

describe("buildBullJobId", () => {
  it("creates BullMQ v5-compatible auxiliary IDs", () => {
    const id = buildBullJobId("idx", "email-1", "INDEX", 123);

    expect(id).toBe("idx-email-1-INDEX-123");
    expect(id).not.toContain(":");
  });
});
