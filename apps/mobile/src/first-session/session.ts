export type FirstSessionPlace =
  | "splash"
  | "discovery"
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
  hasDraft: boolean;
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
  | { type: "continueProfile" };

function showsTabBarFor(place: FirstSessionPlace): boolean {
  return place === "collection" || place === "tab-shell";
}

export function createFirstSession(input: {
  signedIn: boolean;
  hasDraft?: boolean;
}): FirstSessionState {
  const place: FirstSessionPlace = input.signedIn ? "tab-shell" : "splash";
  return {
    place,
    doorMode: null,
    hasDraft: input.hasDraft ?? false,
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
    return { skippedProfile: true, skippedJerseyDetails };
  }
  return { skippedProfile: false, skippedJerseyDetails };
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
    case "openDoor":
      return {
        ...state,
        place: "door",
        doorMode: event.mode,
        showsTabBar: false,
        skippedDiscovery: state.place === "splash" ? true : state.skippedDiscovery,
      };
    case "closeDoor":
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
          showsTabBar: false,
          ...skips,
        };
      }
      return {
        ...state,
        place: "collection",
        identitySession:
          event.method === "social" ? { emailVerified: true } : state.identitySession,
        showsTabBar: true,
        ...skips,
      };
    }
    case "dismissVerifyEmail":
      return {
        ...state,
        place: "profile",
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
