import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { blockArgs, issueIdentifier, optionValue, swapLabelIds } from "../lib/linear-args.mjs";

test("an option value is the argument after its flag", () => {
  assert.equal(
    optionValue(["title", "--origin", "KIT-275", "--body-file", "b.md"], "--origin"),
    "KIT-275",
  );
  assert.equal(optionValue(["title", "--body-file", "b.md"], "--origin"), null);
});

test("a flag with no value, or followed by another flag, has no value", () => {
  assert.equal(optionValue(["--origin"], "--origin"), null);
  assert.equal(optionValue(["--origin", "--body-file", "b.md"], "--origin"), null);
});

test("an issue identifier is upper-cased and anything else is refused", () => {
  assert.equal(issueIdentifier("kit-275"), "KIT-275");
  assert.equal(issueIdentifier(" KIT-9 "), "KIT-9");
  assert.equal(issueIdentifier("275"), null);
  assert.equal(issueIdentifier("KIT-"), null);
  assert.equal(issueIdentifier(null), null);
});

test("block takes the blocked issue and --by blocker; self-blocks and malformed ids are refused", () => {
  assert.deepEqual(blockArgs(["kit-9", "--by", "KIT-3"]), { issue: "KIT-9", by: "KIT-3" });
  assert.equal(blockArgs(["KIT-9"]), null);
  assert.equal(blockArgs(["KIT-9", "--by", "KIT-9"]), null);
  assert.equal(blockArgs(["KIT-9", "--by", "3"]), null);
  assert.equal(blockArgs([]), null);
});

test("swapLabelIds replaces within one set, keeps the others, and refuses when from is absent", () => {
  assert.deepEqual(swapLabelIds(["a", "ready", "b"], "ready", "info"), ["a", "b", "info"]);
  assert.equal(swapLabelIds(["a", "b"], "ready", "info"), null);
  assert.deepEqual(swapLabelIds(["ready"], "ready", "ready"), ["ready"]);
});

// linear.mjs as a command line against a fake Linear endpoint (KIT-369).
const execFileAsync = promisify(execFile);
const LINEAR = fileURLToPath(new URL("../linear.mjs", import.meta.url));
const SECRET = "max-secret-value-9f2c";
const TOKEN = "max-actor-token-7b1e";

async function withFakeLinear(tokenReply, run) {
  const seen = { token: [], graphql: [] };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const record = { authorization: req.headers.authorization ?? null, body };
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/oauth/token") {
        seen.token.push(record);
        res.statusCode = tokenReply.status;
        res.end(JSON.stringify(tokenReply.body));
        return;
      }
      seen.graphql.push(record);
      res.end(JSON.stringify({ data: { organization: { urlKey: "kitcollective", name: "KC" } } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}/graphql`, seen);
  } finally {
    server.close();
  }
}

async function runLinear(url, extraEnv, repoFiles = {}) {
  const repo = mkdtempSync(join(tmpdir(), "linear-cli-"));
  execFileSync("git", ["init", "-q", repo]);
  for (const [name, content] of Object.entries(repoFiles)) writeFileSync(join(repo, name), content);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("LINEAR_")),
  );
  const result = await execFileAsync("node", [LINEAR, "workspace"], {
    cwd: repo,
    env: { ...env, LINEAR_GRAPHQL_URL: url, ...extraEnv },
  }).then(
    ({ stdout, stderr }) => ({ status: 0, stdout, stderr }),
    (error) => ({ status: error.code, stdout: error.stdout, stderr: error.stderr }),
  );
  const files = readdirSync(repo).filter((name) => name !== ".git");
  rmSync(repo, { recursive: true, force: true });
  return { ...result, files };
}

const maxEnv = {
  LINEAR_ACTOR: "max",
  LINEAR_MAX_CLIENT_ID: "max-client-id",
  LINEAR_MAX_CLIENT_SECRET: SECRET,
};

function assertNoLeak(result) {
  for (const value of [SECRET, TOKEN]) {
    assert.ok(!result.stdout.includes(value), "stdout leaks a credential");
    assert.ok(!result.stderr.includes(value), "stderr leaks a credential");
  }
}

test("without LINEAR_ACTOR the personal key goes out as before and no token is requested", async () => {
  await withFakeLinear({ status: 200, body: {} }, async (url, seen) => {
    const result = await runLinear(url, { LINEAR_API_KEY: "lin_api_personal" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(seen.token.length, 0);
    assert.equal(seen.graphql[0].authorization, "lin_api_personal");
  });
});

test("LINEAR_ACTOR=max requests one client-credentials token and sends it as a Bearer", async () => {
  await withFakeLinear({ status: 200, body: { access_token: TOKEN } }, async (url, seen) => {
    const result = await runLinear(url, { ...maxEnv, LINEAR_API_KEY: "lin_api_personal" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(seen.token.length, 1);
    const basic = Buffer.from(`max-client-id:${SECRET}`).toString("base64");
    assert.equal(seen.token[0].authorization, `Basic ${basic}`);
    assert.match(seen.token[0].body, /grant_type=client_credentials/);
    assert.equal(seen.graphql[0].authorization, `Bearer ${TOKEN}`);
    assertNoLeak(result);
    assert.deepEqual(result.files, []);
  });
});

test("the Max client id and secret can come from the main checkout's .env", async () => {
  await withFakeLinear({ status: 200, body: { access_token: TOKEN } }, async (url, seen) => {
    const dotenv = `LINEAR_MAX_CLIENT_ID=max-client-id\nexport LINEAR_MAX_CLIENT_SECRET="${SECRET}"\n`;
    const result = await runLinear(url, { LINEAR_ACTOR: "max" }, { ".env": dotenv });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(seen.graphql[0].authorization, `Bearer ${TOKEN}`);
  });
});

test("a missing Max credential fails with one line naming the variable", async () => {
  await withFakeLinear({ status: 200, body: { access_token: TOKEN } }, async (url, seen) => {
    for (const missing of ["LINEAR_MAX_CLIENT_ID", "LINEAR_MAX_CLIENT_SECRET"]) {
      const env = { ...maxEnv, LINEAR_API_KEY: "lin_api_personal" };
      delete env[missing];
      const result = await runLinear(url, env);
      assert.equal(result.status, 1);
      assert.equal(result.stderr.trim().split("\n").length, 1);
      assert.ok(result.stderr.includes(missing), result.stderr);
      assertNoLeak(result);
    }
    assert.equal(seen.graphql.length, 0, "no fallback to the personal key");
  });
});

test("a refused token request fails with one line naming the variables, not the reply", async () => {
  await withFakeLinear({ status: 401, body: { error: `bad ${SECRET}` } }, async (url, seen) => {
    const result = await runLinear(url, maxEnv);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim().split("\n").length, 1);
    assert.ok(result.stderr.includes("LINEAR_MAX_CLIENT_ID"), result.stderr);
    assert.ok(result.stderr.includes("LINEAR_MAX_CLIENT_SECRET"), result.stderr);
    assertNoLeak(result);
    assert.equal(seen.graphql.length, 0);
  });
});

test("an unknown LINEAR_ACTOR is refused rather than using the personal key", async () => {
  await withFakeLinear({ status: 200, body: {} }, async (url, seen) => {
    const result = await runLinear(url, {
      LINEAR_ACTOR: "nobody",
      LINEAR_API_KEY: "lin_api_personal",
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("LINEAR_ACTOR"), result.stderr);
    assert.equal(seen.graphql.length, 0);
  });
});
