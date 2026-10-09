export type FirstSessionPlace =
  | "welcome"
  | "demo"
  | "chooser"
  | "analysing"
  | "door"
  | "code"
  | "jersey-details"
  | "collection"
  | "tab-shell";

/** How the collector got through the Kom i gang sheet: a provider, or an e-mail that gets a code. */
export type IdentitySubmitMethod = "social" | "email";

export type FirstSessionIdentitySession = {
  emailVerified: boolean;
};

/** The three bundled example jerseys offered on the welcome screen. */
export type DemoExampleId = "example-1" | "example-2" | "example-3";

/** The screen a door sheet sits on top of. */
export type DoorOver = "welcome" | "demo" | "analysing";

export type FirstSessionState = {
  place: FirstSessionPlace;
  doorOver: DoorOver | null;
  hasDraft: boolean;
  captureSessionId: string | null;
  demoExampleId: DemoExampleId | null;
  identitySession: FirstSessionIdentitySession | null;
  showsTabBar: boolean;
  skippedJerseyDetails: boolean;
  jerseysSavedInSession: number;
  resultCollection: boolean;
};

export type FirstSessionEvent =
  | { type: "openDoor" }
  | { type: "closeDoor" }
  | { type: "backFromCode" }
  | { type: "startDemo"; exampleId: DemoExampleId }
  | { type: "demoTryAnother" }
  | { type: "submitIdentity"; method: IdentitySubmitMethod }
  | { type: "saveJersey" }
  | { type: "recordDumpSave" }
  | { type: "startAdd" }
  | { type: "cancelChooser" }
  | { type: "photosPicked"; sessionId: string }
  | { type: "visionComplete" }
  | { type: "visionFailed" }
  | { type: "fillSelf" }
  | { type: "openDoorFromAnalysing" };

type DoorFields = Pick<FirstSessionState, "doorOver">;

const DOOR_CLOSED: DoorFields = {
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
  if (state.place === "welcome" || state.place === "demo" || state.place === "analysing") {
    return state.place;
  }
  return null;
}

function doorOverFor(state: FirstSessionState): DoorOver {
  if (state.place === "door" || state.place === "code") {
    return state.doorOver ?? "welcome";
  }
  if (state.place === "demo" || state.place === "analysing") {
    return state.place;
  }
  return "welcome";
}

function openDoorFromAnalysing(state: FirstSessionState): FirstSessionState {
  return { ...state, place: "door", doorOver: "analysing" };
}

/**
 * A provider sign-in lands on jersey details when a draft exists, otherwise on Samling.
 * An e-mail goes to the code step first and keeps the screen the sheet sat on.
 */
function submitIdentity(
  state: FirstSessionState,
  event: Extract<FirstSessionEvent, { type: "submitIdentity" }>,
): FirstSessionState {
  if (event.method === "email") {
    return { ...state, place: "code", doorOver: doorOverFor(state) };
  }

  const signedIn: FirstSessionState = {
    ...state,
    ...DOOR_CLOSED,
    demoExampleId: null,
    identitySession: { emailVerified: true },
  };

  if (state.hasDraft) {
    return { ...signedIn, place: "jersey-details", skippedJerseyDetails: false };
  }
  return { ...signedIn, place: "collection", skippedJerseyDetails: true };
}

function nextPlace(state: FirstSessionState, event: FirstSessionEvent): FirstSessionState {
  switch (event.type) {
    case "startDemo":
      return { ...state, ...DOOR_CLOSED, place: "demo", demoExampleId: event.exampleId };
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
    case "visionComplete":
    case "visionFailed":
      if (state.place === "door" && state.doorOver === "analysing") {
        return state;
      }
      return openDoorFromAnalysing(state);
    case "fillSelf":
      return openDoorFromAnalysing(state);
    case "openDoorFromAnalysing":
      return openDoorFromAnalysing(state);
    case "openDoor":
      return { ...state, place: "door", doorOver: doorOverFor(state) };
    case "backFromCode":
      return { ...state, place: "door" };
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

export function reduceFirstSession(
  state: FirstSessionState,
  event: FirstSessionEvent,
): FirstSessionState {
  const next = nextPlace(state, event);
  const showsTabBar = showsTabBarFor(next.place);
  return next.showsTabBar === showsTabBar ? next : { ...next, showsTabBar };
}
