import type { IdentityLinkedProvider } from "@kit/api-contract";

export type NativeIdTokenRequester = (provider: IdentityLinkedProvider) => Promise<string>;

const NOT_BROWSER_OAUTH = "Social login is not browser OAuth";

let testRequester: NativeIdTokenRequester | null = null;

export function setNativeIdTokenRequesterForTests(requester: NativeIdTokenRequester | null): void {
  testRequester = requester;
}

/**
 * Native Google/Facebook idToken. Default throws — this is not browser OAuth.
 * Tests (and a later native SDK adapter) inject a requester.
 */
export async function requestNativeIdToken(provider: IdentityLinkedProvider): Promise<string> {
  if (testRequester) {
    return testRequester(provider);
  }

  throw new Error(NOT_BROWSER_OAUTH);
}
