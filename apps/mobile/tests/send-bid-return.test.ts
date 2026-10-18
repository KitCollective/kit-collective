import { describe, expect, it } from "vitest";
import { sendBidExit, sendBidHrefReturningTo } from "../src/search/send-bid-return";

describe("Send bud return (KIT-413)", () => {
  it("carries the path Send nyt bud was tapped in as an encoded returnTo", () => {
    expect(sendBidHrefReturningTo("/(tabs)/search/send-bid/j1", "/inbox/c1")).toBe(
      "/(tabs)/search/send-bid/j1?returnTo=%2Finbox%2Fc1",
    );
  });

  it("returns to the thread when returnTo is an in-app path", () => {
    expect(sendBidExit("/inbox/c1")).toEqual({ kind: "return", href: "/inbox/c1" });
  });

  it("goes back as before when Send bud opened without returnTo", () => {
    expect(sendBidExit(undefined)).toEqual({ kind: "back" });
    expect(sendBidExit("")).toEqual({ kind: "back" });
  });

  it("goes back for an array, a relative value, a scheme or a protocol-relative path", () => {
    expect(sendBidExit(["/inbox/c1", "/inbox/c2"])).toEqual({ kind: "back" });
    expect(sendBidExit("inbox/c1")).toEqual({ kind: "back" });
    expect(sendBidExit("https://example.com/inbox/c1")).toEqual({ kind: "back" });
    expect(sendBidExit("kitcollective://inbox/c1")).toEqual({ kind: "back" });
    expect(sendBidExit("//example.com/inbox/c1")).toEqual({ kind: "back" });
    expect(sendBidExit("/\\example.com")).toEqual({ kind: "back" });
  });
});
