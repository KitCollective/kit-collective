// Puts the two test Collectors back into their known state before a flow.
// API_URL and TEST_DATA_TOKEN are passed in by the flow from the shell environment.
// VISION (optional) picks the fixed Vision answer until the next reset: resolved (the API's
// default), low-confidence, mixed-grouping or failure (KIT-284). A caller that does not pass it,
// such as a flow that runs this script directly, sends `{}` and gets the default.
// The reset also deletes the Test Collector's auth sessions, so a new case needs a new sign-in.
const vision = typeof VISION === "string" && VISION.length > 0 ? VISION : null;
const response = http.post(`${API_URL}/v1/e2e/test-data`, {
  headers: { Authorization: `Bearer ${TEST_DATA_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(vision ? { vision } : {}),
});
if (response.status !== 204) {
  throw new Error(`Test data reset failed with HTTP ${response.status}`);
}
