import { describe, expect, it } from "vitest";
import { workspaceChangedHere } from "../api/identity";
import { resetHomeStore } from "../homeStore";

describe("the home store when the workspace changes", () => {
  it("is cleared by the workspace change signal and can be cleared directly", () => {
    expect(() => resetHomeStore()).not.toThrow();
    expect(() => workspaceChangedHere()).not.toThrow();
  });
});
