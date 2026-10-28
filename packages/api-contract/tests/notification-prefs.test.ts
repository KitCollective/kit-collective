import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_PREFS_DEFAULTS,
  notificationPrefsSchema,
  notificationPrefsUpdateSchema,
} from "../src/index.js";

describe("notificationPrefsSchema", () => {
  const sample = {
    email: { bidsAndMessages: false, wishMatches: true, news: true },
    push: { bids: true, messages: false, wishMatches: true },
  };

  it("round-trips prefs", () => {
    expect(notificationPrefsSchema.parse(sample)).toEqual(sample);
  });

  it("rejects an unknown switch", () => {
    expect(() =>
      notificationPrefsSchema.parse({ ...sample, email: { ...sample.email, sms: true } }),
    ).toThrow();
  });

  it("defaults: bids and messages on, wish matches on, news off, push on", () => {
    expect(NOTIFICATION_PREFS_DEFAULTS).toEqual({
      email: { bidsAndMessages: true, wishMatches: true, news: false },
      push: { bids: true, messages: true, wishMatches: true },
    });
  });
});

describe("notificationPrefsUpdateSchema", () => {
  it("accepts one field in one group", () => {
    expect(notificationPrefsUpdateSchema.parse({ email: { news: true } })).toEqual({
      email: { news: true },
    });
  });

  it("accepts both groups", () => {
    const update = { email: { wishMatches: false }, push: { bids: false } };
    expect(notificationPrefsUpdateSchema.parse(update)).toEqual(update);
  });

  it("rejects an empty body and empty groups", () => {
    expect(() => notificationPrefsUpdateSchema.parse({})).toThrow();
    expect(() => notificationPrefsUpdateSchema.parse({ email: {} })).toThrow();
  });

  it("rejects unknown keys at both levels", () => {
    expect(() => notificationPrefsUpdateSchema.parse({ sms: { news: true } })).toThrow();
    expect(() => notificationPrefsUpdateSchema.parse({ email: { sms: true } })).toThrow();
  });

  it("rejects a switch that is not a boolean", () => {
    expect(() => notificationPrefsUpdateSchema.parse({ push: { bids: "yes" } })).toThrow();
  });
});
