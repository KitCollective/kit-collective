import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMobileAddConfirmRedirect } from "../check-mobile-add-confirm-redirect.mjs";

const compliantConfirm = `
const { state, isSessionResolved, mutate } = usePersistedCaptureSession(sessionId);
useEffect(() => {
  if (shouldConfirmRedirectAway(sessionId, state, isSessionResolved)) {
    router.replace("/(tabs)/add");
  }
}, [router, sessionId, state, isSessionResolved]);
`;

const compliantHook = `
const [isSessionResolved, setIsSessionResolved] = useState(() => sessionId !== undefined);
return loadPersistedCaptureSession(sessionId);
`;

const compliantRedirectHelper = `
export function shouldConfirmRedirectAway(sessionId, state, isSessionResolved) {
  if (!isSessionResolved) return false;
  return !sessionId || !state;
}
`;

const compliantRedirectTest = `
it("does not redirect before the session lookup has resolved", () => {});
`;

describe("checkMobileAddConfirmRedirect", () => {
  it("passes compliant confirm redirect wiring", () => {
    assert.deepEqual(
      checkMobileAddConfirmRedirect({
        confirmSource: compliantConfirm,
        hookSource: compliantHook,
        redirectHelperSource: compliantRedirectHelper,
        redirectTestSource: compliantRedirectTest,
      }),
      [],
    );
  });

  it("fails when confirm redirects on !state without isSessionResolved", () => {
    const violations = checkMobileAddConfirmRedirect({
      confirmSource: `
        useEffect(() => {
          if (!sessionId || !state) {
            router.replace("/(tabs)/add");
          }
        }, [router, sessionId, state]);
      `,
      hookSource: compliantHook,
      redirectHelperSource: compliantRedirectHelper,
      redirectTestSource: compliantRedirectTest,
    });

    assert.ok(violations.some((line) => line.includes("shouldConfirmRedirectAway")));
    assert.ok(violations.some((line) => line.includes("isSessionResolved")));
  });

  it("fails when the hook omits isSessionResolved", () => {
    const violations = checkMobileAddConfirmRedirect({
      confirmSource: compliantConfirm,
      hookSource: "return { state, mutate };",
      redirectHelperSource: compliantRedirectHelper,
      redirectTestSource: compliantRedirectTest,
    });

    assert.ok(violations.some((line) => line.includes("isSessionResolved")));
  });
});
