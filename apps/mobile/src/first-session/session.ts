export type FirstSessionPlace = "splash" | "door" | "verify-email" | "samling" | "tab-shell";

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
  | { type: "dismissVerifyEmail" };

function showsTabBarFor(place: FirstSessionPlace): boolean {
  return place === "samling" || place === "tab-shell";
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

function skipProfileAndDetails(
  state: FirstSessionState,
): Pick<FirstSessionState, "skippedProfile" | "skippedJerseyDetails"> {
  if (state.hasDraft) {
    return {
      skippedProfile: state.skippedProfile,
      skippedJerseyDetails: state.skippedJerseyDetails,
    };
  }
  return { skippedProfile: true, skippedJerseyDetails: true };
}

export function reduceFirstSession(
  state: FirstSessionState,
  event: FirstSessionEvent,
): FirstSessionState {
  switch (event.type) {
    case "continueFromSplash":
      return {
        ...state,
        place: "splash",
        showsTabBar: false,
      };
    case "openDoor":
      return {
        ...state,
        place: "door",
        doorMode: event.mode,
        showsTabBar: false,
        skippedDiscovery: true,
      };
    case "closeDoor":
      return {
        ...state,
        place: "splash",
        doorMode: null,
        showsTabBar: false,
      };
    case "submitIdentity": {
      const skips = skipProfileAndDetails(state);
      if (event.method === "password" && event.kind === "register") {
        return {
          ...state,
          place: "verify-email",
          identitySession: { emailVerified: false },
          showsTabBar: false,
          ...skips,
        };
      }
      return {
        ...state,
        place: "samling",
        identitySession:
          event.method === "social" ? { emailVerified: true } : state.identitySession,
        showsTabBar: true,
        ...skips,
      };
    }
    case "dismissVerifyEmail":
      return {
        ...state,
        place: "samling",
        showsTabBar: true,
      };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
