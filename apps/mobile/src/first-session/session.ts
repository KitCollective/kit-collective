export type FirstSessionPlace =
  | "welcome"
  | "demo"
  | "chooser"
  | "analysing"
  | "vision-failed"
  | "door"
  | "jersey-details"
  | "collection"
  | "tab-shell";

export type DoorMode = "login" | "register";

export type IdentitySubmitMethod = "password" | "social";

export type IdentitySubmitKind = "login" | "register";

export type FirstSessionIdentitySession = {
  emailVerified: boolean;
};

/** The three bundled example jerseys offered on the welcome screen. */
export type DemoExampleId = "example-1" | "example-2" | "example-3";

/** The screen a door sheet sits on top of. */
export type DoorOver = "welcome" | "demo" | "analysing" | "vision-failed";

export type FirstSessionState = {
  place: FirstSessionPlace;
  doorMode: DoorMode | null;
  doorOver: DoorOver | null;
  hasDraft: boolean;
  captureSessionId: string | null;
  demoExampleId: DemoExampleId | null;
  identitySession: FirstSessionIdentitySession | null;
  showsTabBar: boolean;
  skippedJerseyDetails: boolean;
  /** True once an example was shown: only then does Samling say the example was not saved. */
  sawDemo: boolean;
  jerseysSavedInSession: number;
  resultCollection: boolean;
};

export type FirstSessionEvent =
  | { type: "openDoor"; mode: DoorMode }
  | { type: "closeDoor" }
  | { type: "startDemo"; exampleId: DemoExampleId }
  | { type: "demoTryAnother" }
  | { type: "submitIdentity"; method: IdentitySubmitMethod; kind: IdentitySubmitKind }
  | { type: "saveJersey" }
  | { type: "recordDumpSave" }
  | { type: "startAdd" }
  | { type: "cancelChooser" }
  | { type: "tryAnotherPhoto" }
  | { type: "photosPicked"; sessionId: string }
  | { type: "visionComplete" }
  | { type: "visionFailed" }
  | { type: "fillSelf" }
  | { type: "openDoorFromAnalysing"; mode?: DoorMode };

type DoorFields = Pick<FirstSessionState, "doorMode" | "doorOver">;

const DOOR_CLOSED: DoorFields = {
  doorMode: null,
  doorOver: null,
};

function showsTabBarFor(place: FirstSessionPlace): boolean {
  return place === "collection" || place === "tab-shell";
}

export function createFirstSession(input: {
  signedIn: boolean;
  hasDraft?: boolean;
  captureSessionId?: string | null;
}): FirstSessionState {
  const place: FirstSessionPlace = input.signedIn ? "tab-shell" : "welcome";
  return {
    ...DOOR_CLOSED,
    place,
    hasDraft: input.hasDraft ?? false,
    captureSessionId: input.captureSessionId ?? null,
    demoExampleId: null,
    identitySession: null,
    showsTabBar: showsTabBarFor(place),
    skippedJerseyDetails: false,
    sawDemo: false,
    jerseysSavedInSession: 0,
    resultCollection: false,
  };
}

export type FirstSessionBackdrop = DoorOver;

/** The single full-screen surface behind any sheet, or null when a sheet owns the screen. */
export function firstSessionBackdrop(state: FirstSessionState): FirstSessionBackdrop | null {
  if (state.place === "door") {
    return state.doorOver ?? "welcome";
  }
  if (
    state.place === "welcome" ||
    state.place === "demo" ||
    state.place === "analysing" ||
    state.place === "vision-failed"
  ) {
    return state.place;
  }
  // The source sheet is a sheet over the welcome screen.
  if (state.place === "chooser") {
    return "welcome";
  }
  return null;
}

function doorOverFor(state: FirstSessionState): DoorOver {
  if (state.place === "door") {
    return state.doorOver ?? "welcome";
  }
  if (state.place === "demo" || state.place === "analysing" || state.place === "vision-failed") {
    return state.place;
  }
  return "welcome";
}

function openDoorFromAnalysing(
  state: FirstSessionState,
  mode: DoorMode = "register",
): FirstSessionState {
  return { ...state, place: "door", doorMode: mode, doorOver: "analysing" };
}

/** Identity leads to jersey details when a draft exists, otherwise to Samling. */
function submitIdentity(
  state: FirstSessionState,
  event: Extract<FirstSessionEvent, { type: "submitIdentity" }>,
): FirstSessionState {
  const signedIn: FirstSessionState = {
    ...state,
    ...DOOR_CLOSED,
    demoExampleId: null,
    identitySession: event.method === "social" ? { emailVerified: true } : state.identitySession,
  };

  if (state.hasDraft) {
    return { ...signedIn, place: "jersey-details", skippedJerseyDetails: false };
  }
  return { ...signedIn, place: "collection", skippedJerseyDetails: true };
}

function nextPlace(state: FirstSessionState, event: FirstSessionEvent): FirstSessionState {
  switch (event.type) {
    case "startDemo":
      return {
        ...state,
        ...DOOR_CLOSED,
        place: "demo",
        demoExampleId: event.exampleId,
        sawDemo: true,
      };
    case "demoTryAnother":
      return { ...state, ...DOOR_CLOSED, place: "welcome", demoExampleId: null };
    case "startAdd":
      return { ...state, place: "chooser" };
    case "cancelChooser":
      return { ...state, place: "welcome" };
    case "photosPicked":
      return {
        ...state,
        place: "analysing",
        hasDraft: true,
        captureSessionId: event.sessionId,
      };
    case "tryAnotherPhoto":
      return { ...state, place: "chooser", hasDraft: false, captureSessionId: null };
    case "visionComplete":
      // A late answer never moves a collector who has already left analysing or opened the door.
      return state.place === "analysing" ? openDoorFromAnalysing(state) : state;
    case "visionFailed":
      // Vision could not read the jersey: say so and keep the photo. No door yet.
      return state.place === "analysing" ? { ...state, place: "vision-failed" } : state;
    case "fillSelf":
      if (state.place === "vision-failed") {
        return { ...state, place: "door", doorMode: "register", doorOver: "vision-failed" };
      }
      return openDoorFromAnalysing(state);
    case "openDoorFromAnalysing":
      return openDoorFromAnalysing(state, event.mode);
    case "openDoor":
      return { ...state, place: "door", doorMode: event.mode, doorOver: doorOverFor(state) };
    case "closeDoor":
      return { ...state, ...DOOR_CLOSED, place: state.doorOver ?? "welcome" };
    case "submitIdentity":
      return submitIdentity(state, event);
    case "recordDumpSave":
      return { ...state, jerseysSavedInSession: state.jerseysSavedInSession + 1 };
    case "saveJersey":
      return {
        ...state,
        place: "collection",
        hasDraft: false,
        jerseysSavedInSession: state.jerseysSavedInSession + 1,
        resultCollection: true,
      };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** Where the host sends the collector once the first session ends. */
export function collectionHref(state: FirstSessionState): string {
  if (state.resultCollection) {
    return "/(tabs)/collection?firstSessionResult=1";
  }
  if (state.skippedJerseyDetails && state.sawDemo) {
    return "/(tabs)/collection?firstSessionArrival=1";
  }
  return "/(tabs)/collection";
}

export function reduceFirstSession(
  state: FirstSessionState,
  event: FirstSessionEvent,
): FirstSessionState {
  const next = nextPlace(state, event);
  const showsTabBar = showsTabBarFor(next.place);
  return next.showsTabBar === showsTabBar ? next : { ...next, showsTabBar };
}
