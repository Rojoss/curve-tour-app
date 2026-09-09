import { describe, expect, it } from "vitest";
import { getRouter } from "../router";

describe("generated route tree", () => {
  it("registers the root application route", () => {
    const router = getRouter();
    expect(router.routesByPath["/"]).toBeDefined();
  });
});
