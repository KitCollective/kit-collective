import { describe, expect, it } from "vitest";
import { createFirstSession, reduceFirstSession } from "../src/first-session/session";

describe("First session launch", () => {
  it("unsigned launch place is splash", () => {
    const session = createFirstSession({ signedIn: false });

    expect(session.place).toBe("splash");
    expect(session.showsTabBar).toBe(false);
  });

  it("signed-in launch place is tab-shell", () => {
    const session = createFirstSession({ signedIn: true });

    expect(session.place).toBe("tab-shell");
    expect(session.showsTabBar).toBe(true);
  });
});

describe("First session door from splash", () => {
  it("openDoor login from splash skips Discovery", () => {
    const session = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "openDoor",
      mode: "login",
    });

    expect(session.place).toBe("door");
    expect(session.doorMode).toBe("login");
    expect(session.skippedDiscovery).toBe(true);
    expect(session.place).not.toBe("discovery");
  });

  it("openDoor register from splash skips Discovery", () => {
    const session = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "openDoor",
      mode: "register",
    });

    expect(session.place).toBe("door");
    expect(session.doorMode).toBe("register");
    expect(session.skippedDiscovery).toBe(true);
    expect(session.place).not.toBe("discovery");
  });
});

describe("First session identity without draft", () => {
  it("login without draft lands on samling, skips profile and jersey details, and shows the tab bar", () => {
    const door = reduceFirstSession(createFirstSession({ signedIn: false, hasDraft: false }), {
      type: "openDoor",
      mode: "login",
    });
    const session = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "password",
      kind: "login",
    });

    expect(session.place).toBe("samling");
    expect(session.skippedProfile).toBe(true);
    expect(session.skippedJerseyDetails).toBe(true);
    expect(session.showsTabBar).toBe(true);
    expect(session.place).not.toBe("profile");
    expect(session.place).not.toBe("jersey-details");
  });

  it("password register without draft shows verify-email with emailVerified false, then dismiss lands on samling and skips profile and details", () => {
    const door = reduceFirstSession(createFirstSession({ signedIn: false, hasDraft: false }), {
      type: "openDoor",
      mode: "register",
    });
    const afterRegister = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "password",
      kind: "register",
    });

    expect(afterRegister.place).toBe("verify-email");
    expect(afterRegister.identitySession).toEqual({ emailVerified: false });
    expect(afterRegister.showsTabBar).toBe(false);

    const session = reduceFirstSession(afterRegister, { type: "dismissVerifyEmail" });

    expect(session.place).toBe("samling");
    expect(session.identitySession).toEqual({ emailVerified: false });
    expect(session.skippedProfile).toBe(true);
    expect(session.skippedJerseyDetails).toBe(true);
    expect(session.showsTabBar).toBe(true);
    expect(session.place).not.toBe("profile");
    expect(session.place).not.toBe("jersey-details");
  });

  it("social submit skips the verify beat and lands on samling", () => {
    const door = reduceFirstSession(createFirstSession({ signedIn: false, hasDraft: false }), {
      type: "openDoor",
      mode: "register",
    });
    const session = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "social",
      kind: "register",
    });

    expect(session.place).toBe("samling");
    expect(session.place).not.toBe("verify-email");
    expect(session.showsTabBar).toBe(true);
  });
});

describe("First session tab bar", () => {
  it("hides the tab bar on splash, door, and verify-email, and shows it on samling", () => {
    const splash = createFirstSession({ signedIn: false });
    expect(splash.place).toBe("splash");
    expect(splash.showsTabBar).toBe(false);

    const door = reduceFirstSession(splash, { type: "openDoor", mode: "register" });
    expect(door.place).toBe("door");
    expect(door.showsTabBar).toBe(false);

    const verify = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "password",
      kind: "register",
    });
    expect(verify.place).toBe("verify-email");
    expect(verify.showsTabBar).toBe(false);

    const samling = reduceFirstSession(verify, { type: "dismissVerifyEmail" });
    expect(samling.place).toBe("samling");
    expect(samling.showsTabBar).toBe(true);
  });
});

describe("First session continue from splash", () => {
  it("continueFromSplash does not open Discovery this slice and stays on splash", () => {
    const session = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "continueFromSplash",
    });

    expect(session.place).toBe("splash");
    expect(session.place).not.toBe("discovery");
    expect(session.skippedDiscovery).toBe(false);
  });
});
