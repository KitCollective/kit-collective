// Reads the six-digit sign-in code the local API mailed to EMAIL (its recording mailer) and
// sets output.code, plus output.wrong, a code that is not it. With EXPIRE set to "true" it first
// lets that code expire. API_URL, TEST_DATA_TOKEN, EMAIL and EXPIRE come in from the flow.
const headers = { Authorization: `Bearer ${TEST_DATA_TOKEN}` };
const email = encodeURIComponent(EMAIL);

const response = http.get(`${API_URL}/v1/e2e/last-code?email=${email}`, { headers });
if (response.status !== 200) {
  throw new Error(`No sign-in code for ${EMAIL}: HTTP ${response.status}`);
}
const code = json(response.body).code;
output.code = code;
output.wrong = code === "000000" ? "000001" : "000000";

if (EXPIRE === "true") {
  const expired = http.post(`${API_URL}/v1/e2e/expire-code?email=${email}`, {
    headers,
    body: "{}",
  });
  if (expired.status !== 204) {
    throw new Error(`Expiring the code failed with HTTP ${expired.status}`);
  }
}
