// Puts the two test Collectors back into their known state before a flow.
// MAESTRO_* values come from the shell (lane secrets on EAS, local.env.sh locally).
const response = http.post(`${API_URL}/v1/e2e/test-data`, {
  headers: { Authorization: `Bearer ${TEST_DATA_TOKEN}` },
});
if (response.status !== 204) {
  throw new Error(`Test data reset failed with HTTP ${response.status}`);
}
