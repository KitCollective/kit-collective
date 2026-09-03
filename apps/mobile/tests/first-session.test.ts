import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCaptureSession,
  createMemoryCaptureSessionStore,
  getActiveDraft,
  photoUriForRole,
} from "../src/capture/captureSession";
import { replacePersistedCapturePhotos } from "../src/capture/captureSessionPersistence";
import { shouldGateFirstSessionSave } from "../src/first-session/first-session-entitlement";
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

    const chooser = reduceFirstSession(discovery, { type: "startAdd" });
    expect(chooser.place).toBe("chooser");
    expect(chooser.showsTabBar).toBe(false);

    const analysing = reduceFirstSession(chooser, {
      type: "photosPicked",
      sessionId: "capture-session-1",
    });
    expect(analysing.place).toBe("analysing");
    expect(analysing.showsTabBar).toBe(false);

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

describe("First session add to door flow", () => {
  it("startAdd opens chooser without premium gating", () => {
    const discovery = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "continueFromSplash",
    });
    const chooser = reduceFirstSession(discovery, { type: "startAdd" });

    expect(chooser.place).toBe("chooser");
    expect(chooser.showsTabBar).toBe(false);
    expect(chooser.hasDraft).toBe(false);
  });

  it("photosPicked creates draft state and moves to analysing", () => {
    const chooser = reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "continueFromSplash",
      }),
      { type: "startAdd" },
    );
    const session = reduceFirstSession(chooser, {
      type: "photosPicked",
      sessionId: "capture-session-1",
    });

    expect(session.place).toBe("analysing");
    expect(session.hasDraft).toBe(true);
    expect(session.captureSessionId).toBe("capture-session-1");
    expect(session.showsTabBar).toBe(false);
  });

  it("visionComplete opens register door over analysing", () => {
    const analysing = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "photosPicked",
      sessionId: "capture-session-1",
    });
    const door = reduceFirstSession(analysing, { type: "visionComplete" });

    expect(door.place).toBe("door");
    expect(door.doorMode).toBe("register");
    expect(door.doorOverAnalysing).toBe(true);
    expect(door.hasDraft).toBe(true);
    expect(door.captureSessionId).toBe("capture-session-1");
  });

  it("visionFailed and fillSelf fail-open to register door over analysing", () => {
    const analysing = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "photosPicked",
      sessionId: "capture-session-1",
    });

    const failed = reduceFirstSession(analysing, { type: "visionFailed" });
    expect(failed.place).toBe("door");
    expect(failed.doorMode).toBe("register");
    expect(failed.doorOverAnalysing).toBe(true);

    const filled = reduceFirstSession(analysing, { type: "fillSelf" });
    expect(filled.place).toBe("door");
    expect(filled.doorMode).toBe("register");
    expect(filled.doorOverAnalysing).toBe(true);
  });

  it("closeDoor from analysing-backed door returns to analysing", () => {
    const door = reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "photosPicked",
        sessionId: "capture-session-1",
      }),
      { type: "fillSelf" },
    );
    const back = reduceFirstSession(door, { type: "closeDoor" });

    expect(back.place).toBe("analysing");
    expect(back.doorMode).toBe(null);
    expect(back.doorOverAnalysing).toBe(false);
    expect(back.captureSessionId).toBe("capture-session-1");
  });

  it("login with draft opens jersey-details and keeps the capture session", () => {
    const door = reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "photosPicked",
        sessionId: "capture-session-1",
      }),
      { type: "visionComplete" },
    );
    const afterLogin = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "password",
      kind: "login",
    });

    expect(afterLogin.place).toBe("jersey-details");
    expect(afterLogin.hasDraft).toBe(true);
    expect(afterLogin.captureSessionId).toBe("capture-session-1");
    expect(afterLogin.showsTabBar).toBe(false);
    expect(afterLogin.skippedProfile).toBe(false);
    expect(afterLogin.place).not.toBe("collection");
    expect(afterLogin.place).not.toBe("profile");

    const host = readFileSync(join(__dirname, "../app/(first-session)/index.tsx"), "utf8");
    expect(host).not.toContain("requestPremiumAccess");
  });

  it("draft survives persisted capture session create through identity", () => {
    const store = createMemoryCaptureSessionStore();
    const sessionId = replacePersistedCapturePhotos(
      null,
      [{ uri: "file:///photos/front.jpg", role: "front", source: "gallery" }],
      { store },
    );
    const loaded = store.load();
    expect(loaded).not.toBeNull();
    if (!loaded) {
      throw new Error("expected capture session");
    }
    expect(photoUriForRole(getActiveDraft(loaded), "front")).toBe("file:///photos/front.jpg");

    const door = reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "photosPicked",
        sessionId,
      }),
      { type: "fillSelf" },
    );
    const afterRegister = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "social",
      kind: "register",
    });

    expect(afterRegister.hasDraft).toBe(true);
    expect(afterRegister.captureSessionId).toBe(sessionId);
    expect(afterRegister.place).toBe("profile");
    expect(store.load()?.sessionId).toBe(sessionId);
  });

  it("visionComplete does not clobber login door mode when door is already open", () => {
    const analysing = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "photosPicked",
      sessionId: "capture-session-1",
    });
    const loginDoor = reduceFirstSession(analysing, {
      type: "openDoorFromAnalysing",
      mode: "login",
    });
    const afterVision = reduceFirstSession(loginDoor, { type: "visionComplete" });

    expect(afterVision.place).toBe("door");
    expect(afterVision.doorMode).toBe("login");
    expect(afterVision.doorOverAnalysing).toBe(true);
  });

  it("≤3 picker photos bind one jersey in the capture draft", () => {
    const store = createMemoryCaptureSessionStore();
    const state = createCaptureSession(["file:///a.jpg", "file:///b.jpg", "file:///c.jpg"], {
      store,
    });

    expect(state.branch).toBe("single");
    expect(getActiveDraft(state).photos).toHaveLength(3);
  });

  it(">3 picker photos use bulk bind branch in the capture draft", () => {
    const store = createMemoryCaptureSessionStore();
    const state = createCaptureSession(
      ["file:///a.jpg", "file:///b.jpg", "file:///c.jpg", "file:///d.jpg"],
      { store },
    );

    expect(state.branch).toBe("bulk");
    expect(state.unboundUris).toHaveLength(4);
  });

  it("unsigned vision client targets unsigned routes", () => {
    const vision = readFileSync(join(__dirname, "../src/api/vision.ts"), "utf8");

    expect(vision).toContain("startUnsignedVisionSuggest");
    expect(vision).toContain("fetchUnsignedVisionJob");
    expect(vision).toContain("/v1/collection/vision/suggest/unsigned");
    expect(vision).toContain("/v1/collection/vision/jobs/");
    expect(vision).toContain("/unsigned");
  });
});

describe("First session jersey details and first Save", () => {
  function sessionAtProfileWithDraft() {
    const door = reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "photosPicked",
        sessionId: "capture-session-1",
      }),
      { type: "visionComplete" },
    );
    const afterRegister = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "social",
      kind: "register",
    });
    expect(afterRegister.place).toBe("profile");
    expect(afterRegister.hasDraft).toBe(true);
    return afterRegister;
  }

  it("continueProfile with draft opens jersey-details with tab bar hidden", () => {
    const details = reduceFirstSession(sessionAtProfileWithDraft(), { type: "continueProfile" });

    expect(details.place).toBe("jersey-details");
    expect(details.hasDraft).toBe(true);
    expect(details.captureSessionId).toBe("capture-session-1");
    expect(details.showsTabBar).toBe(false);
    expect(details.skippedJerseyDetails).toBe(false);
    expect(details.place).not.toBe("collection");
  });

  it("saveJersey from jersey-details lands on result Samling with tab bar and one save counted", () => {
    const details = reduceFirstSession(sessionAtProfileWithDraft(), { type: "continueProfile" });
    const result = reduceFirstSession(details, { type: "saveJersey" });

    expect(result.place).toBe("collection");
    expect(result.showsTabBar).toBe(true);
    expect(result.hasDraft).toBe(false);
    expect(result.jerseysSavedInSession).toBe(1);
    expect(result.resultSamling).toBe(true);
    expect(result.showsTabBar).toBe(true);
  });

  it("first Save is not entitlement-gated; a second save in the dump is", () => {
    expect(shouldGateFirstSessionSave({ jerseysSavedInSession: 0 })).toBe(false);
    expect(shouldGateFirstSessionSave({ jerseysSavedInSession: 1 })).toBe(true);
  });

  it("host wires jersey-details Confirm body and result Samling caption without Gem senere", () => {
    const host = readFileSync(join(__dirname, "../app/(first-session)/index.tsx"), "utf8");
    const details = readFileSync(
      join(__dirname, "../src/first-session/jersey-details-screen.tsx"),
      "utf8",
    );
    const copy = readFileSync(
      join(__dirname, "../src/first-session/jersey-details-copy.ts"),
      "utf8",
    );
    const collection = readFileSync(join(__dirname, "../app/(tabs)/collection/index.tsx"), "utf8");
    const collectionHeader = readFileSync(
      join(__dirname, "../src/components/collection-header.tsx"),
      "utf8",
    );

    expect(host).toContain("JerseyDetailsScreen");
    expect(host).toContain('place === "jersey-details"');
    expect(host).toContain("saveJersey");
    expect(details).toContain("JERSEY_DETAILS_TITLE");
    expect(details).toContain("JERSEY_DETAILS_PRIMARY_SAVE");
    expect(copy).toContain("Trøjens detaljer");
    expect(copy).toContain("Gem i samlingen");
    expect(details).toContain("saveUserJersey");
    expect(details).toContain("canSave");
    expect(details).toContain("shouldGateFirstSessionSave");
    expect(details).toContain("requestPremiumAccess");
    expect(`${details}\n${copy}`).not.toContain("Gem senere");
    expect(copy).toContain("RESULT_SAMLING_BUD_CAPTION");
    expect(collection).toContain("RESULT_SAMLING_BUD_CAPTION");
    expect(collectionHeader).not.toContain("lockup");
    expect(collectionHeader).not.toContain("kitcollective-lockup");
  });

  it("after result Samling, plus is not first-session chrome", () => {
    const result = reduceFirstSession(
      reduceFirstSession(sessionAtProfileWithDraft(), { type: "continueProfile" }),
      { type: "saveJersey" },
    );
    expect(result.place).toBe("collection");
    expect(result.resultSamling).toBe(true);

    const tabBar = readFileSync(join(__dirname, "../src/components/floating-tab-bar.tsx"), "utf8");
    expect(tabBar).toContain("requestPremiumAccess");
    expect(tabBar).toContain('router.push("/(tabs)/add")');
    expect(tabBar).not.toContain("first-session");
    expect(tabBar).not.toContain("Læser trøjen");
  });
});
