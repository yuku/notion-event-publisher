import { describe, it, expect } from "vitest";
import { parseGcsUri, detectChanges } from "./index";

describe("parseGcsUri", () => {
  it("parses a GCS URI", () => {
    const uri = "gs://my-bucket/my-object";
    const result = parseGcsUri(uri);
    expect(result).toEqual({
      bucketName: "my-bucket",
      objectPath: "my-object",
    });
  });

  it("throws an error for an invalid GCS URI", () => {
    const uri = "invalid-uri";
    expect(() => parseGcsUri(uri)).toThrowError("Invalid GCS URI: invalid-uri");
  });
});

describe("detectChanges", () => {
  it("treat all pages in newState as created if there are no pages in oldState", () => {
    const oldState = {};
    const newState = {
      page1: new Date(),
      page2: new Date(),
    };
    const result = detectChanges(oldState, newState);
    expect(result).toEqual({
      created: ["page1", "page2"],
      updated: [],
      deleted: [],
    });
  });
});
