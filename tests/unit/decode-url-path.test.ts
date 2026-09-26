import { describe, expect, it } from "vitest";
import { decodeLandingPage } from "@/lib/utils/decode-url-path";

describe("decodeLandingPage", () => {
  it("decodes percent-encoded non-ASCII paths", () => {
    expect(decodeLandingPage("/%E0%A6%87%E0%A6%82%E0%A6%B0%E0%A7%87%E0%A6%9C%E0%A6%BF")).toBe(
      "/ইংরেজি"
    );
  });

  it("leaves plain ASCII paths unchanged", () => {
    expect(decodeLandingPage("/blog/hello-world")).toBe("/blog/hello-world");
  });

  it("falls back to the raw string on a malformed sequence", () => {
    expect(decodeLandingPage("/%E0%A6")).toBe("/%E0%A6");
  });
});
