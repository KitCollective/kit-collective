export type FirstSessionPlace =
  | "splash"
  | "discovery"
  | "chooser"
  | "analysing"
  | "door"
  | "verify-email"
  | "profile"
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
  hasDraft: boolean;
  captureSessionId: string | null;
  identitySession: FirstSessionIdentitySession | null;
  showsTabBar: boolean;
  skippedDiscovery: boolean;
  skippedProfile: boolean;
  skippedJerseyDetails: boolean;
};

export type FirstSessionEvent =
  | { type: "openDoor"; mode: DoorMode }
  | { type: "closeDoor" }
  | { type: "continueFromSplash" }
  | { type: "submitIdentity"; method: IdentitySubmitMethod; kind: IdentitySubmitKind }
  | { type: "dismissVerifyEmail" }
  | { type: "continueProfile" }
  | { type: "startAdd" }
  | { type: "cancelChooser" }
  | { type: "photosPicked"; sessionId: string }
  | { type: "visionComplete" }
  | { type: "visionFailed" }
  | { type: "fillSelf" }
  | { type: "openDoorFromAnalysing"; mode?: DoorMode };

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
    place,
    doorMode: null,
    doorOverAnalysing: false,
    hasDraft: input.hasDraft ?? false,
    captureSessionId: input.captureSessionId ?? null,
    identitySession: null,
    showsTabBar: showsTabBarFor(place),
    skippedDiscovery: false,
    skippedProfile: false,
    skippedJerseyDetails: false,
  };
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
    place: "door",
    doorMode: mode,
    doorOverAnalysing: true,
    showsTabBar: false,
  };
}

export function reduceFirstSession(
  state: FirstSessionState,
  event: FirstSessionEvent,
): FirstSessionState {
  switch (event.type) {
    case "continueFromSplash":
      return {
        ...state,
        place: "discovery",
        showsTabBar: false,
      };
    case "startAdd":
      return {
        ...state,
        place: "chooser",
        showsTabBar: false,
      };
    case "cancelChooser":
      return {
        ...state,
        place: "discovery",
        showsTabBar: false,
      };
    case "photosPicked":
      return {
        ...state,
        place: "analysing",
        hasDraft: true,
        captureSessionId: event.sessionId,
        showsTabBar: false,
      };
    case "visionComplete":
    case "visionFailed":
      if (state.place === "door" && state.doorOverAnalysing) {
        return state;
      }
      return openDoorFromAnalysing(state, "register");
    case "fillSelf":
      return openDoorFromAnalysing(state, "register");
    case "openDoorFromAnalysing":
      return openDoorFromAnalysing(state, event.mode ?? "register");
    case "openDoor":
      return {
        ...state,
        place: "door",
        doorMode: event.mode,
        doorOverAnalysing: false,
        showsTabBar: false,
        skippedDiscovery: state.place === "splash" ? true : state.skippedDiscovery,
      };
    case "closeDoor":
      if (state.doorOverAnalysing) {
        return {
          ...state,
          place: "analysing",
          doorMode: null,
          doorOverAnalysing: false,
          showsTabBar: false,
        };
      }
      return {
        ...state,
        place: state.skippedDiscovery ? "splash" : "discovery",
        doorMode: null,
        showsTabBar: false,
      };
    case "submitIdentity": {
      const skips = identitySkips(state, event.kind);
      if (event.method === "password" && event.kind === "register") {
        return {
          ...state,
          place: "verify-email",
          identitySession: { emailVerified: false },
          doorMode: null,
          doorOverAnalysing: false,
          showsTabBar: false,
          ...skips,
        };
      }
      if (event.kind === "register") {
        return {
          ...state,
          place: "profile",
          identitySession:
            event.method === "social" ? { emailVerified: true } : state.identitySession,
          doorMode: null,
          doorOverAnalysing: false,
          showsTabBar: false,
          ...skips,
        };
      }
      return {
        ...state,
        place: "collection",
        identitySession:
          event.method === "social" ? { emailVerified: true } : state.identitySession,
        doorMode: null,
        doorOverAnalysing: false,
        showsTabBar: true,
        ...skips,
      };
    }
    case "dismissVerifyEmail":
      return {
        ...state,
        place: "profile",
        doorMode: null,
        doorOverAnalysing: false,
        showsTabBar: false,
      };
    case "continueProfile":
      return {
        ...state,
        place: "collection",
        showsTabBar: true,
      };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
