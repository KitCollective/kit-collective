/** First UserJersey Save in a first-session dump is free; later Saves need Tilføj trøje Entitlement. */
export function shouldGateFirstSessionSave(input: { jerseysSavedInSession: number }): boolean {
  return input.jerseysSavedInSession >= 1;
}
