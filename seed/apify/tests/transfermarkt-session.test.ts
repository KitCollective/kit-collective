import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TransfermarktHttpError,
  TransfermarktWafChallengeError,
} from "../src/fetch/transfermarkt-errors.js";
import {
  createCookieJar,
  createTransfermarktSession,
  directTransfermarktRequestHeaders,
  type TransfermarktSessionFetch,
} from "../src/fetch/transfermarkt-session.js";

const WAF_CHALLENGE_HTML =
  '<!DOCTYPE html><html><head><script>window.awsWafCookieDomainList = [];window.gokuProps = {"key":"x"}</script></head><body></body></html>';

function response(
  init: Partial<{ status: number; setCookie: string[]; body: string; bytes: Uint8Array }> = {},
) {
  const status = init.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { getSetCookie: () => init.setCookie ?? [] },
    text: async () => init.body ?? "<html>ok</html>",
    arrayBuffer: async () => (init.bytes ?? new Uint8Array([1, 2, 3])).buffer as ArrayBuffer,
  };
}

describe("createCookieJar", () => {
  it("keeps the latest value per cookie and drops expired ones", () => {
    const jar = createCookieJar();

    expect(jar.accept(["aws-waf-token=abc; Path=/; Secure", "sid=1"])).toBe(true);
    expect(jar.header()).toBe("aws-waf-token=abc; sid=1");

    expect(jar.accept(["aws-waf-token=def"])).toBe(true);
    expect(jar.header()).toBe("aws-waf-token=def; sid=1");

    expect(jar.accept(["sid=1; Max-Age=0"])).toBe(true);
    expect(jar.header()).toBe("aws-waf-token=def");
  });

  it("reports no change when the same cookie comes back", () => {
    const jar = createCookieJar({ sid: "1" });
    expect(jar.accept(["sid=1"])).toBe(false);
  });

  it("has no Cookie header when empty", () => {
    expect(createCookieJar().header()).toBeUndefined();
  });
});

describe("createTransfermarktSession", () => {
  it("sends the WAF cookie from the first response on the next request", async () => {
    const seen: Array<Record<string, string>> = [];
    const fetchImpl: TransfermarktSessionFetch = async (_url, init) => {
      seen.push(init.headers);
      return response({ setCookie: seen.length === 1 ? ["aws-waf-token=token-1; Path=/"] : [] });
    };

    const session = createTransfermarktSession({ fetchImpl });
    await session.fetchHtml("https://www.transfermarkt.com/a");
    await session.fetchHtml("https://www.transfermarkt.com/b");

    expect(seen[0]?.Cookie).toBeUndefined();
    expect(seen[1]?.Cookie).toBe("aws-waf-token=token-1");
  });

  it("persists the jar so the next run starts warm", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kit-session-"));
    const cookieFile = path.join(dir, "session-cookies.json");

    const first = createTransfermarktSession({
      cookieFile,
      fetchImpl: async () => response({ setCookie: ["aws-waf-token=token-9"] }),
    });
    await first.fetchHtml("https://www.transfermarkt.com/a");

    expect(JSON.parse(await readFile(cookieFile, "utf8"))).toEqual({
      "aws-waf-token": "token-9",
    });

    const sent: Array<Record<string, string>> = [];
    const second = createTransfermarktSession({
      cookieFile,
      fetchImpl: async (_url, init) => {
        sent.push(init.headers);
        return response();
      },
    });
    await second.fetchHtml("https://www.transfermarkt.com/b");

    expect(sent[0]?.Cookie).toBe("aws-waf-token=token-9");
  });

  it("names the WAF challenge instead of handing it to the parser", async () => {
    const session = createTransfermarktSession({
      fetchImpl: async () => response({ status: 202, body: WAF_CHALLENGE_HTML }),
    });

    await expect(session.fetchHtml("https://www.transfermarkt.com/a")).rejects.toBeInstanceOf(
      TransfermarktWafChallengeError,
    );
  });

  it("names a challenge served with HTTP 200", async () => {
    const session = createTransfermarktSession({
      fetchImpl: async () => response({ status: 200, body: WAF_CHALLENGE_HTML }),
    });

    await expect(session.fetchHtml("https://www.transfermarkt.com/a")).rejects.toBeInstanceOf(
      TransfermarktWafChallengeError,
    );
  });

  it("raises the upstream status for a failed GET", async () => {
    const session = createTransfermarktSession({
      fetchImpl: async () => response({ status: 502, body: "502 Bad Gateway" }),
    });

    await expect(session.fetchHtml("https://www.transfermarkt.com/a")).rejects.toMatchObject({
      name: "TransfermarktHttpError",
      status: 502,
    });
  });

  it("fetches portrait bytes with image headers on the same jar", async () => {
    const seen: Array<Record<string, string>> = [];
    const session = createTransfermarktSession({
      fetchImpl: async (_url, init) => {
        seen.push(init.headers);
        return response({ setCookie: ["aws-waf-token=token-2"] });
      },
    });

    await session.fetchHtml("https://www.transfermarkt.com/a");
    const bytes = await session.fetchBytes("https://img.a.transfermarkt.technology/portrait.jpg");

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(seen[1]?.Accept).toContain("image/");
    expect(seen[1]?.["Sec-Fetch-Dest"]).toBe("image");
    expect(seen[1]?.Cookie).toBe("aws-waf-token=token-2");
  });

  it("raises the status for a failed portrait GET", async () => {
    const session = createTransfermarktSession({
      fetchImpl: async () => response({ status: 404 }),
    });

    await expect(
      session.fetchBytes("https://img.a.transfermarkt.technology/portrait.jpg"),
    ).rejects.toBeInstanceOf(TransfermarktHttpError);
  });
});

describe("directTransfermarktRequestHeaders", () => {
  it("uses a browser User-Agent so Desktop GETs are not 502d as a named bot", () => {
    const headers = directTransfermarktRequestHeaders();
    expect(headers["User-Agent"]).toMatch(/^Mozilla\/5\.0 /);
    expect(headers["User-Agent"]).not.toMatch(/KitCollective-Seed/);
  });

  it("sends the navigation header set a browser would", () => {
    const headers = directTransfermarktRequestHeaders();
    expect(headers.Accept).toContain("text/html");
    expect(headers["Sec-Fetch-Mode"]).toBe("navigate");
    expect(headers["Upgrade-Insecure-Requests"]).toBe("1");
  });
});
