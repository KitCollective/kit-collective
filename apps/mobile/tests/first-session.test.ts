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
import {
  collectionHref,
  createFirstSession,
  firstSessionBackdrop,
  reduceFirstSession,
} from "../src/first-session/session";

describe("First session launch", () => {
  it("unsigned launch place is welcome", () => {
    const session = createFirstSession({ signedIn: false });

    expect(session.place).toBe("welcome");
    expect(session.showsTabBar).toBe(false);
  });

  it("signed-in launch place is tab-shell", () => {
    const session = createFirstSession({ signedIn: true });

    expect(session.place).toBe("tab-shell");
    expect(session.showsTabBar).toBe(true);
  });
});

describe("First session welcome and demo", () => {
  const welcome = () => createFirstSession({ signedIn: false });

  it("tapping an example starts the demo directly, with no pick screen in between", () => {
    const demo = reduceFirstSession(welcome(), { type: "startDemo", exampleId: "example-2" });

    expect(demo.place).toBe("demo");
    expect(demo.demoExampleId).toBe("example-2");
    expect(demo.showsTabBar).toBe(false);
    expect(demo.hasDraft).toBe(false);
    expect(demo.captureSessionId).toBe(null);
  });

  it("Prøv en anden trøje returns to welcome and forgets the example", () => {
    const demo = reduceFirstSession(welcome(), { type: "startDemo", exampleId: "example-1" });
    const back = reduceFirstSession(demo, { type: "demoTryAnother" });

    expect(back.place).toBe("welcome");
    expect(back.demoExampleId).toBe(null);
    expect(firstSessionBackdrop(back)).toBe("welcome");
  });

  it("Kom i gang from the demo opens the door over the demo, and closing returns to the same demo", () => {
    const demo = reduceFirstSession(welcome(), { type: "startDemo", exampleId: "example-3" });
    const door = reduceFirstSession(demo, { type: "openDoor", mode: "register" });

    expect(door.place).toBe("door");
    expect(door.doorOver).toBe("demo");
    expect(firstSessionBackdrop(door)).toBe("demo");

    const back = reduceFirstSession(door, { type: "closeDoor" });
    expect(back.place).toBe("demo");
    expect(back.demoExampleId).toBe("example-3");
  });

  it("Jeg har allerede en konto opens the door over welcome and closes back to welcome", () => {
    const door = reduceFirstSession(welcome(), { type: "openDoor", mode: "login" });

    expect(door.place).toBe("door");
    expect(door.doorMode).toBe("login");
    expect(door.doorOver).toBe("welcome");
    expect(firstSessionBackdrop(door)).toBe("welcome");
    expect(reduceFirstSession(door, { type: "closeDoor" }).place).toBe("welcome");
  });

  it("swapping door mode keeps the screen behind the door", () => {
    const demo = reduceFirstSession(welcome(), { type: "startDemo", exampleId: "example-1" });
    const door = reduceFirstSession(demo, { type: "openDoor", mode: "register" });
    const swapped = reduceFirstSession(door, { type: "openDoor", mode: "login" });

    expect(swapped.doorMode).toBe("login");
    expect(firstSessionBackdrop(swapped)).toBe("demo");
  });

  it("Brug mit eget foto opens the existing chooser, and cancelling returns to welcome", () => {
    const chooser = reduceFirstSession(welcome(), { type: "startAdd" });

    expect(chooser.place).toBe("chooser");
    expect(chooser.showsTabBar).toBe(false);
    expect(reduceFirstSession(chooser, { type: "cancelChooser" }).place).toBe("welcome");
  });
});

describe("First session identity", () => {
  const door = (mode: "login" | "register", hasDraft = false) =>
    reduceFirstSession(createFirstSession({ signedIn: false, hasDraft }), {
      type: "openDoor",
      mode,
    });

  it.each([
    ["password", "login"],
    ["password", "register"],
    ["social", "login"],
    ["social", "register"],
  ] as const)("%s %s without a draft lands on Samling and shows the tab bar", (method, kind) => {
    const session = reduceFirstSession(door(kind), { type: "submitIdentity", method, kind });

    expect(session.place).toBe("collection");
    expect(session.skippedJerseyDetails).toBe(true);
    expect(session.showsTabBar).toBe(true);
  });

  it("after the demo, identity lands on Samling and the example leaves no draft", () => {
    const demo = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "startDemo",
      exampleId: "example-1",
    });
    const session = reduceFirstSession(
      reduceFirstSession(demo, { type: "openDoor", mode: "register" }),
      {
        type: "submitIdentity",
        method: "social",
        kind: "register",
      },
    );

    expect(session.place).toBe("collection");
    expect(session.hasDraft).toBe(false);
    expect(session.demoExampleId).toBe(null);
  });

  it("social identity marks the e-mail verified, password identity does not", () => {
    const social = reduceFirstSession(door("register"), {
      type: "submitIdentity",
      method: "social",
      kind: "register",
    });
    const password = reduceFirstSession(door("register"), {
      type: "submitIdentity",
      method: "password",
      kind: "register",
    });

    expect(social.identitySession).toEqual({ emailVerified: true });
    expect(password.identitySession).toBe(null);
  });

  it.each(["register", "login"] as const)(
    "%s identity with a draft opens jersey details",
    (kind) => {
      const session = reduceFirstSession(door(kind, true), {
        type: "submitIdentity",
        method: "social",
        kind,
      });

      expect(session.place).toBe("jersey-details");
      expect(session.showsTabBar).toBe(false);
    },
  );
});

describe("First session path has no onboard, profile or verify-email place", () => {
  it("every reachable place is on the new path", () => {
    const onPath = new Set([
      "welcome",
      "demo",
      "chooser",
      "analysing",
      "vision-failed",
      "door",
      "jersey-details",
      "collection",
      "tab-shell",
    ]);
    let state = createFirstSession({ signedIn: false });
    const seen = new Set<string>([state.place]);
    const events: Parameters<typeof reduceFirstSession>[1][] = [
      { type: "startDemo", exampleId: "example-1" },
      { type: "openDoor", mode: "register" },
      { type: "closeDoor" },
      { type: "demoTryAnother" },
      { type: "startAdd" },
      { type: "photosPicked", sessionId: "capture-session-1" },
      { type: "visionFailed" },
      { type: "tryAnotherPhoto" },
      { type: "photosPicked", sessionId: "capture-session-2" },
      { type: "visionComplete" },
      { type: "submitIdentity", method: "password", kind: "register" },
      { type: "saveJersey" },
    ];
    for (const event of events) {
      state = reduceFirstSession(state, event);
      seen.add(state.place);
    }

    for (const place of seen) {
      expect(onPath.has(place)).toBe(true);
    }
    for (const place of onPath) {
      expect(place).not.toMatch(/onboard|profile|verify/);
    }
  });

  it("the reducer source carries no onboard, profile or verify-email vocabulary", () => {
    const source = readFileSync(join(__dirname, "../src/first-session/session.ts"), "utf8");

    expect(source).not.toMatch(/onboard|profile|verify-email|continueFromSplash|discovery/i);
  });
});

describe("First session arrival in Samling", () => {
  const signedInWithoutDraft = () =>
    reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "startDemo",
        exampleId: "example-1",
      }),
      { type: "submitIdentity", method: "social", kind: "register" },
    );

  it("the demo road arrives with the first-arrival signal and no result signal", () => {
    expect(collectionHref(signedInWithoutDraft())).toBe("/(tabs)/collection?firstSessionArrival=1");
  });

  it("the own-photo road arrives with the saved jersey, not the empty first-arrival slot", () => {
    const saved = reduceFirstSession(
      reduceFirstSession(
        reduceFirstSession(
          reduceFirstSession(createFirstSession({ signedIn: false }), {
            type: "photosPicked",
            sessionId: "capture-session-1",
          }),
          { type: "visionComplete" },
        ),
        { type: "submitIdentity", method: "social", kind: "register" },
      ),
      { type: "saveJersey" },
    );

    expect(collectionHref(saved)).toBe("/(tabs)/collection?firstSessionResult=1");
  });

  it("a signed-in launch lands on plain Samling", () => {
    expect(collectionHref(createFirstSession({ signedIn: true }))).toBe("/(tabs)/collection");
  });
});

describe("First session tab bar", () => {
  it("hides the tab bar on welcome, demo, chooser, analysing and door, and shows it on collection", () => {
    const welcome = createFirstSession({ signedIn: false });
    const demo = reduceFirstSession(welcome, { type: "startDemo", exampleId: "example-1" });
    const door = reduceFirstSession(demo, { type: "openDoor", mode: "register" });
    const chooser = reduceFirstSession(welcome, { type: "startAdd" });
    const analysing = reduceFirstSession(chooser, {
      type: "photosPicked",
      sessionId: "capture-session-1",
    });

    for (const state of [welcome, demo, door, chooser, analysing]) {
      expect(state.showsTabBar).toBe(false);
    }

    const collection = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "social",
      kind: "register",
    });
    expect(collection.place).toBe("collection");
    expect(collection.showsTabBar).toBe(true);
  });
});

describe("First session add to door flow", () => {
  it("startAdd opens chooser without premium gating", () => {
    const chooser = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "startAdd",
    });

    expect(chooser.place).toBe("chooser");
    expect(chooser.showsTabBar).toBe(false);
    expect(chooser.hasDraft).toBe(false);
  });

  it("photosPicked creates draft state and moves to analysing", () => {
    const chooser = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "startAdd",
    });
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
    expect(door.doorOver).toBe("analysing");
    expect(door.hasDraft).toBe(true);
    expect(door.captureSessionId).toBe("capture-session-1");
  });

  it("visionFailed shows the failure screen, keeps the photo and does not open the door", () => {
    const analysing = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "photosPicked",
      sessionId: "capture-session-1",
    });
    const failed = reduceFirstSession(analysing, { type: "visionFailed" });

    expect(failed.place).toBe("vision-failed");
    expect(failed.doorMode).toBe(null);
    expect(failed.hasDraft).toBe(true);
    expect(failed.captureSessionId).toBe("capture-session-1");
    expect(failed.showsTabBar).toBe(false);
    expect(firstSessionBackdrop(failed)).toBe("vision-failed");
  });

  it("a Vision failure never yanks a door the collector already opened", () => {
    const door = reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "photosPicked",
        sessionId: "capture-session-1",
      }),
      { type: "fillSelf" },
    );

    expect(reduceFirstSession(door, { type: "visionFailed" })).toEqual(door);
  });

  it("fillSelf from analysing opens the register door over analysing", () => {
    const analysing = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "photosPicked",
      sessionId: "capture-session-1",
    });
    const filled = reduceFirstSession(analysing, { type: "fillSelf" });

    expect(filled.place).toBe("door");
    expect(filled.doorMode).toBe("register");
    expect(filled.doorOver).toBe("analysing");
  });

  it("Udfyld selv on the failure screen opens the door over it and the photo reaches jersey details", () => {
    const failed = reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "photosPicked",
        sessionId: "capture-session-1",
      }),
      { type: "visionFailed" },
    );
    const door = reduceFirstSession(failed, { type: "fillSelf" });

    expect(door.place).toBe("door");
    expect(door.doorMode).toBe("register");
    expect(door.doorOver).toBe("vision-failed");
    expect(firstSessionBackdrop(door)).toBe("vision-failed");

    const back = reduceFirstSession(door, { type: "closeDoor" });
    expect(back.place).toBe("vision-failed");
    expect(back.captureSessionId).toBe("capture-session-1");

    const afterIdentity = reduceFirstSession(door, {
      type: "submitIdentity",
      method: "social",
      kind: "register",
    });
    expect(afterIdentity.place).toBe("jersey-details");
    expect(afterIdentity.hasDraft).toBe(true);
    expect(afterIdentity.captureSessionId).toBe("capture-session-1");
  });

  it("Prøv et andet foto returns to the source sheet over welcome and drops the failed draft", () => {
    const failed = reduceFirstSession(
      reduceFirstSession(createFirstSession({ signedIn: false }), {
        type: "photosPicked",
        sessionId: "capture-session-1",
      }),
      { type: "visionFailed" },
    );
    const chooser = reduceFirstSession(failed, { type: "tryAnotherPhoto" });

    expect(chooser.place).toBe("chooser");
    expect(chooser.hasDraft).toBe(false);
    expect(chooser.captureSessionId).toBe(null);
    expect(chooser.showsTabBar).toBe(false);
    expect(firstSessionBackdrop(chooser)).toBe("welcome");
  });

  it("the source sheet sits over the welcome screen", () => {
    const chooser = reduceFirstSession(createFirstSession({ signedIn: false }), {
      type: "startAdd",
    });

    expect(firstSessionBackdrop(chooser)).toBe("welcome");
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
    expect(back.doorOver).toBe(null);
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
    expect(afterLogin.place).not.toBe("collection");

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
    expect(afterRegister.place).toBe("jersey-details");
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
    expect(afterVision.doorOver).toBe("analysing");
  });

  it("≤3 picker photos bind one jersey in the capture draft", () => {
    const store = createMemoryCaptureSessionStore();
    const state = createCaptureSession(["file:///a.jpg", "file:///b.jpg", "file:///c.jpg"], {
      store,
    });

    expect(state.branch).toBe("single");
    expect(getActiveDraft(state).photos).toHaveLength(3);
  });

  it("4+ picker photos use bulk bind branch in the capture draft", () => {
    const store = createMemoryCaptureSessionStore();
    const uris = Array.from({ length: 7 }, (_, index) => `file:///photo-${index}.jpg`);
    const state = createCaptureSession(uris, { store });

    expect(state.branch).toBe("bulk");
    expect(state.unboundUris).toHaveLength(7);
  });

  it("unsigned vision client targets unsigned routes", () => {
    const vision = readFileSync(join(__dirname, "../src/api/vision.ts"), "utf8");
    const analysing = readFileSync(
      join(__dirname, "../src/first-session/analysing-screen.tsx"),
      "utf8",
    );

    expect(vision).toContain("startUnsignedVisionSuggest");
    expect(vision).toContain("fetchUnsignedVisionJob");
    expect(vision).toContain("/v1/collection/vision/suggest/unsigned");
    expect(vision).toContain("/v1/collection/vision/jobs/");
    expect(vision).toContain("/unsigned");
    expect(analysing).toContain("buildIdentitySuggestRequest");
  });
});

describe("First session jersey details and first Save", () => {
  function sessionAtJerseyDetails() {
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
    expect(afterRegister.place).toBe("jersey-details");
    expect(afterRegister.hasDraft).toBe(true);
    return afterRegister;
  }

  it("identity with a draft goes straight to jersey-details, keeping the capture session", () => {
    const details = sessionAtJerseyDetails();

    expect(details.place).toBe("jersey-details");
    expect(details.captureSessionId).toBe("capture-session-1");
    expect(details.showsTabBar).toBe(false);
    expect(details.skippedJerseyDetails).toBe(false);
  });

  it("saveJersey from jersey-details lands on result Collection with tab bar and one save counted", () => {
    const details = sessionAtJerseyDetails();
    const result = reduceFirstSession(details, { type: "saveJersey" });

    expect(result.place).toBe("collection");
    expect(result.showsTabBar).toBe(true);
    expect(result.hasDraft).toBe(false);
    expect(result.jerseysSavedInSession).toBe(1);
    expect(result.resultCollection).toBe(true);
  });

  it("first Save is not entitlement-gated; a second save in the dump is", () => {
    expect(shouldGateFirstSessionSave({ jerseysSavedInSession: 0 })).toBe(false);
    expect(shouldGateFirstSessionSave({ jerseysSavedInSession: 1 })).toBe(true);
  });

  it("host wires jersey-details Confirm body and result Collection caption without Gem senere", () => {
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
    expect(copy).toMatch(/JERSEY_DETAILS_PRIMARY_SAVE = "Gem"/);
    expect(copy).not.toContain("Gem i samlingen");
    expect(details).toContain("saveUserJersey");
    expect(details).toContain("canSave");
    expect(details).toContain("shouldGateFirstSessionSave");
    expect(details).toContain("requestPremiumAccess");
    expect(`${details}\n${copy}`).not.toContain("Gem senere");
    expect(details).not.toContain("Analyserer foto");
    expect(details).toContain("visionSkeleton");
    expect(copy).toContain("RESULT_COLLECTION_BUD_CAPTION");
    expect(collection).toContain("RESULT_COLLECTION_BUD_CAPTION");
    expect(collectionHeader).not.toContain("lockup");
    expect(collectionHeader).not.toContain("kitcollective-lockup");
  });

  it("after result Collection, plus is not first-session chrome", () => {
    const details = sessionAtJerseyDetails();
    const result = reduceFirstSession(details, { type: "saveJersey" });
    expect(result.place).toBe("collection");
    expect(result.resultCollection).toBe(true);

    // Capture is now the Samling header action, not tab-bar chrome.
    const collectionScreen = readFileSync(
      join(__dirname, "../app/(tabs)/collection/index.tsx"),
      "utf8",
    );
    expect(collectionScreen).toContain("requestPremiumAccess");
    expect(collectionScreen).toContain("captureChooser.open()");
    // The header capture button is ordinary chrome, never first-session/loading chrome.
    const header = readFileSync(join(__dirname, "../src/components/collection-header.tsx"), "utf8");
    expect(header).toContain('name="Tilføj trøje"');
    expect(header).not.toContain("first-session");
    expect(header).not.toContain("Læser trøjen");
  });
});
