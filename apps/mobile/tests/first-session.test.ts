import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("login without draft lands on collection, skips profile and jersey details, and shows the tab bar", () => {
    const door = reduceFirstSession(createFirstSession({ signedIn: false, hasDraft: false }), {
      type: "openDoor",
      mode: "login",
    });
    const session = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "password",
      kind: "login",
    });

    expect(session.place).toBe("collection");
    expect(session.skippedProfile).toBe(true);
    expect(session.skippedJerseyDetails).toBe(true);
    expect(session.showsTabBar).toBe(true);
    expect(session.place).not.toBe("profile");
    expect(session.place).not.toBe("jersey-details");
  });

  it("password register without draft shows verify-email, then profile; empty Fortsæt lands on collection", () => {
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
    expect(afterRegister.skippedProfile).toBe(false);

    const profile = reduceFirstSession(afterRegister, { type: "dismissVerifyEmail" });

    expect(profile.place).toBe("profile");
    expect(profile.identitySession).toEqual({ emailVerified: false });
    expect(profile.skippedProfile).toBe(false);
    expect(profile.skippedJerseyDetails).toBe(true);
    expect(profile.showsTabBar).toBe(false);
    expect(profile.place).not.toBe("collection");
    expect(profile.place).not.toBe("jersey-details");

    const session = reduceFirstSession(profile, { type: "continueProfile" });

    expect(session.place).toBe("collection");
    expect(session.showsTabBar).toBe(true);
    expect(session.skippedJerseyDetails).toBe(true);
  });

  it("social register skips the verify beat and opens profile", () => {
    const door = reduceFirstSession(createFirstSession({ signedIn: false, hasDraft: false }), {
      type: "openDoor",
      mode: "register",
    });
    const session = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "social",
      kind: "register",
    });

    expect(session.place).toBe("profile");
    expect(session.place).not.toBe("verify-email");
    expect(session.skippedProfile).toBe(false);
    expect(session.showsTabBar).toBe(false);

    const collection = reduceFirstSession(session, { type: "continueProfile" });

    expect(collection.place).toBe("collection");
    expect(collection.showsTabBar).toBe(true);
    expect(collection.skippedProfile).toBe(false);
    expect(collection.skippedJerseyDetails).toBe(true);
  });

  it("social login without draft lands on collection and never opens profile", () => {
    const door = reduceFirstSession(createFirstSession({ signedIn: false, hasDraft: false }), {
      type: "openDoor",
      mode: "login",
    });
    const session = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "social",
      kind: "login",
    });

    expect(session.place).toBe("collection");
    expect(session.skippedProfile).toBe(true);
    expect(session.showsTabBar).toBe(true);
    expect(session.place).not.toBe("profile");
  });
});

describe("First session tab bar", () => {
  it("hides the tab bar on splash, discovery, door, verify-email, and profile, and shows it on collection", () => {
    const splash = createFirstSession({ signedIn: false });
    expect(splash.place).toBe("splash");
    expect(splash.showsTabBar).toBe(false);

    const discovery = reduceFirstSession(splash, { type: "continueFromSplash" });
    expect(discovery.place).toBe("discovery");
    expect(discovery.showsTabBar).toBe(false);

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

    const profile = reduceFirstSession(verify, { type: "dismissVerifyEmail" });
    expect(profile.place).toBe("profile");
    expect(profile.showsTabBar).toBe(false);

    const collection = reduceFirstSession(profile, { type: "continueProfile" });
    expect(collection.place).toBe("collection");
    expect(collection.showsTabBar).toBe(true);
  });
});

describe("First session continue from splash", () => {
  it("continueFromSplash opens Discovery and keeps skippedDiscovery false", () => {
    const session = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "continueFromSplash",
    });

    expect(session.place).toBe("discovery");
    expect(session.skippedDiscovery).toBe(false);
    expect(session.showsTabBar).toBe(false);
  });

  it("openDoor from Discovery keeps skippedDiscovery false and closeDoor returns to Discovery", () => {
    const discovery = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "continueFromSplash",
    });
    const door = reduceFirstSession(discovery, { type: "openDoor", mode: "login" });

    expect(door.place).toBe("door");
    expect(door.skippedDiscovery).toBe(false);

    const back = reduceFirstSession(door, { type: "closeDoor" });
    expect(back.place).toBe("discovery");
  });
});

describe("First session showcase seam", () => {
  it("empty showcase response still leaves add-first available in the host", () => {
    const source = readFileSync(
      join(__dirname, "../src/first-session/discovery-showcase.tsx"),
      "utf8",
    );

    expect(source).toContain("DISCOVERY_ADD_FIRST_LABEL");
    expect(source).toContain("<Button label={DISCOVERY_ADD_FIRST_LABEL}");
    expect(source).not.toContain("disabled={jerseys.length === 0}");
  });
});
