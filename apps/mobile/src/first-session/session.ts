export type FirstSessionPlace =
  | "splash"
  | "onboard"
  | "discovery"
  | "chooser"
  | "analysing"
  | "door"
  | "verify-email"
  | "profile"
  | "jersey-details"
  | "collection"
  | "tab-shell";

export type DoorMode = "login" | "register";

export type IdentitySubmitMethod = "password" | "social";

export type IdentitySubmitKind = "login" | "register";

export type FirstSessionIdentitySession = {
  emailVerified: boolean;
};

export type FirstSessionState = {
  place: FirstSessionPlace;
  doorMode: DoorMode | null;
  doorOverAnalysing: boolean;
  doorOverOnboard: boolean;
  hasDraft: boolean;
  captureSessionId: string | null;
  identitySession: FirstSessionIdentitySession | null;
  showsTabBar: boolean;
  skippedDiscovery: boolean;
  onboardCompleted: boolean;
  skippedProfile: boolean;
  skippedJerseyDetails: boolean;
  jerseysSavedInSession: number;
  resultCollection: boolean;
};

export type FirstSessionEvent =
  | { type: "openDoor"; mode: DoorMode }
  | { type: "closeDoor" }
  | { type: "continueFromSplash" }
  | { type: "completeOnboard" }
  | { type: "submitIdentity"; method: IdentitySubmitMethod; kind: IdentitySubmitKind }
  | { type: "dismissVerifyEmail" }
  | { type: "continueProfile" }
  | { type: "saveJersey" }
  | { type: "recordDumpSave" }
  | { type: "startAdd" }
  | { type: "cancelChooser" }
  | { type: "photosPicked"; sessionId: string }
  | { type: "visionComplete" }
  | { type: "visionFailed" }
  | { type: "fillSelf" }
  | { type: "openDoorFromAnalysing"; mode?: DoorMode };

type DoorFields = Pick<FirstSessionState, "doorMode" | "doorOverAnalysing" | "doorOverOnboard">;

const DOOR_CLOSED: DoorFields = {
  doorMode: null,
  doorOverAnalysing: false,
  doorOverOnboard: false,
};

function showsTabBarFor(place: FirstSessionPlace): boolean {
  return place === "collection" || place === "tab-shell";
}

export function createFirstSession(input: {
  signedIn: boolean;
  hasDraft?: boolean;
  captureSessionId?: string | null;
}): FirstSessionState {
  const place: FirstSessionPlace = input.signedIn ? "tab-shell" : "splash";
  return {
    ...DOOR_CLOSED,
    place,
    hasDraft: input.hasDraft ?? false,
    captureSessionId: input.captureSessionId ?? null,
    identitySession: null,
    showsTabBar: showsTabBarFor(place),
    skippedDiscovery: false,
    onboardCompleted: false,
    skippedProfile: false,
    skippedJerseyDetails: false,
    jerseysSavedInSession: 0,
    resultCollection: false,
  };
}

const BACKDROP_PLACES = ["splash", "onboard", "discovery", "analysing"] as const;

export type FirstSessionBackdrop = (typeof BACKDROP_PLACES)[number];

/**
 * The screen the door sheet sits on top of, and the screen a dismissed door
 * returns to.
 */
export function placeBehindDoor(state: FirstSessionState): FirstSessionBackdrop {
  if (state.doorOverAnalysing) {
    return "analysing";
  }
  if (state.doorOverOnboard) {
    return "onboard";
  }
  if (state.skippedDiscovery) {
    return "splash";
  }
  return "discovery";
}

/** The single full-screen surface behind any sheet, or null when a sheet owns the screen. */
export function firstSessionBackdrop(state: FirstSessionState): FirstSessionBackdrop | null {
  if (state.place === "door") {
    return placeBehindDoor(state);
  }
  return BACKDROP_PLACES.find((place) => place === state.place) ?? null;
}

function identitySkips(
  state: FirstSessionState,
  kind: IdentitySubmitKind,
): Pick<FirstSessionState, "skippedProfile" | "skippedJerseyDetails"> {
  const skippedJerseyDetails = state.hasDraft ? state.skippedJerseyDetails : true;
  if (kind === "login" && !state.hasDraft) {
    return { skippedProfile: true, skippedJerseyDetails: true };
  }
  return { skippedProfile: false, skippedJerseyDetails };
}

function openDoorFromAnalysing(
  state: FirstSessionState,
  mode: DoorMode = "register",
): FirstSessionState {
  return {
    ...state,
    ...DOOR_CLOSED,
    place: "door",
    doorMode: mode,
    doorOverAnalysing: true,
  };
}

function landAfterOnboard(state: FirstSessionState): FirstSessionState {
  if (state.hasDraft) {
    return { ...state, place: "jersey-details", skippedJerseyDetails: false };
  }
  return { ...state, place: "collection" };
}

function submitIdentity(
  state: FirstSessionState,
  event: Extract<FirstSessionEvent, { type: "submitIdentity" }>,
): FirstSessionState {
  const signedIn: FirstSessionState = {
    ...state,
    ...DOOR_CLOSED,
    ...identitySkips(state, event.kind),
    identitySession: event.method === "social" ? { emailVerified: true } : state.identitySession,
  };

  if (event.method === "password" && event.kind === "register") {
    return { ...signedIn, place: "verify-email", identitySession: { emailVerified: false } };
  }
  if (event.kind === "register") {
    return { ...signedIn, place: "profile" };
  }
  if (state.hasDraft) {
    return { ...signedIn, place: "jersey-details", skippedJerseyDetails: false };
  }
  return { ...signedIn, place: "collection" };
}

function nextPlace(state: FirstSessionState, event: FirstSessionEvent): FirstSessionState {
  switch (event.type) {
    case "continueFromSplash":
      return { ...state, place: "onboard" };
    case "completeOnboard": {
      const seen: FirstSessionState = { ...state, ...DOOR_CLOSED, onboardCompleted: true };
      if (state.identitySession) {
        return landAfterOnboard(seen);
      }
      return { ...seen, place: "door", doorMode: "register", doorOverOnboard: true };
    }
    case "startAdd":
      return { ...state, place: "chooser" };
    case "cancelChooser":
      return { ...state, place: "discovery" };
    case "photosPicked":
      return {
        ...state,
        place: "analysing",
        hasDraft: true,
        captureSessionId: event.sessionId,
      };
    case "visionComplete":
    case "visionFailed":
      if (state.place === "door" && state.doorOverAnalysing) {
        return state;
      }
      return openDoorFromAnalysing(state);
    case "fillSelf":
      return openDoorFromAnalysing(state);
    case "openDoorFromAnalysing":
      return openDoorFromAnalysing(state, event.mode);
    case "openDoor":
      return {
        ...state,
        place: "door",
        doorMode: event.mode,
        doorOverAnalysing: false,
        // Swapping login/register inside the door keeps the screen behind it.
        doorOverOnboard: state.place === "door" && state.doorOverOnboard,
        skippedDiscovery: state.place === "splash" ? true : state.skippedDiscovery,
        onboardCompleted: event.mode === "login" ? true : state.onboardCompleted,
      };
    case "closeDoor":
      return { ...state, ...DOOR_CLOSED, place: placeBehindDoor(state) };
    case "submitIdentity":
      return submitIdentity(state, event);
    case "dismissVerifyEmail":
      return { ...state, ...DOOR_CLOSED, place: "profile" };
    case "continueProfile":
      if (!state.onboardCompleted) {
        return { ...state, place: "onboard" };
      }
      return landAfterOnboard(state);
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
