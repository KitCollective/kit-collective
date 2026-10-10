// Puts the two test Collectors back into their known state before a flow.
// API_URL and TEST_DATA_TOKEN are passed in by the flow from the shell environment.
const response = http.post(`${API_URL}/v1/e2e/test-data`, {
  headers: { Authorization: `Bearer ${TEST_DATA_TOKEN}`, "Content-Type": "application/json" },
  body: "{}",
});
if (response.status !== 204) {
  throw new Error(`Test data reset failed with HTTP ${response.status}`);
}
