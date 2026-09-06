import { SPLASH_REGISTER_LABEL } from "@/first-session/door-copy";

export type OnboardExit = "door" | "app";

export type OnboardSlideId = "register" | "collection" | "wishlist";

export type OnboardSlide = {
  id: OnboardSlideId;
  title: string;
  body: string;
};

export const ONBOARD_NEXT_LABEL = "Fortsæt";

export const ONBOARD_SLIDES: readonly OnboardSlide[] = [
  {
    id: "register",
    title: "Registrer din samling",
    body: "Start med billederne, du allerede har. En trøje bliver en post — ikke et skema.",
  },
  {
    id: "collection",
    title: "Se den som billeder",
    body: "Samlingen er et fotogrid, du kan scanne. Foto først, klub og sæson under.",
  },
  {
    id: "wishlist",
    title: "Få besked om drømmetrøjen",
    body: "Sæt et ønske. Når en trøje matcher, får du besked — uden at scrolle.",
  },
];

export function onboardPrimaryLabel(isLastSlide: boolean, exit: OnboardExit): string {
  if (isLastSlide && exit === "door") {
    return SPLASH_REGISTER_LABEL;
  }
  return ONBOARD_NEXT_LABEL;
}
