/**
 * R2 access for device-flow evidence (KIT-267): S3 Signature Version 4
 * over fetch. Dependency-free so it runs from any checkout with plain `node`.
 */
import { createHash, createHmac } from "node:crypto";

const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding as S3 expects it; `/` is kept in object keys. */
function encode(value, keepSlash = false) {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return keepSlash ? encoded.replaceAll("%2F", "/") : encoded;
}

function canonicalQuery(query) {
  return Object.keys(query)
    .sort()
    .map((key) => `${encode(key)}=${encode(query[key])}`)
    .join("&");
}

/**
 * @param {{
 *   accessKeyId: string, secretAccessKey: string, region: string,
 *   method: string, host: string, path: string,
 *   query?: Record<string, string>, headers?: Record<string, string>,
 *   payloadHash: string, amzDate: string,
 * }} request `amzDate` is `YYYYMMDDTHHMMSSZ`; `path` is unencoded.
 * @returns {{ authorization: string, headers: Record<string, string>, url: string }}
 */
export function signS3Request({
  accessKeyId,
  secretAccessKey,
  region,
  method,
  host,
  path,
  query = {},
  headers = {},
  payloadHash,
  amzDate,
}) {
  const signed = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const names = Object.keys(signed).sort();
  const signedHeaders = names.join(";");
  const encodedPath = encode(path, true);
  const queryString = canonicalQuery(query);
  const canonicalRequest = [
    method,
    encodedPath,
    queryString,
    ...names.map((name) => `${name}:${signed[name]}`),
    "",
    signedHeaders,
    payloadHash,
  ].join("\n");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = ["s3", "aws4_request"].reduce(
    (key, part) => hmac(key, part),
    hmac(hmac(`AWS4${secretAccessKey}`, date), region),
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope},SignedHeaders=${signedHeaders},Signature=${signature}`;
  const { host: _host, ...sendable } = signed;
  return {
    authorization,
    headers: { ...sendable, authorization },
    url: `https://${host}${encodedPath}${queryString ? `?${queryString}` : ""}`,
  };
}

const R2_ENV = ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];

function amzDateNow() {
  return new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
}

/**
 * The evidence bucket's settings: the account's R2 endpoint and keys as the API
 * names them, with `E2E_R2_BUCKET` naming the evidence bucket. It is a bucket of
 * its own so it can be public without exposing any Collector's photos.
 * @param {NodeJS.ProcessEnv} env
 */
export function evidenceBucketEnv(env) {
  const bucket = env.E2E_R2_BUCKET?.trim();
  if (!bucket) {
    throw new Error("E2E_R2_BUCKET is required (the evidence bucket, never a lane bucket)");
  }
  return { ...env, R2_BUCKET: bucket };
}

/**
 * An R2 bucket over the S3 API. Uses the same env names as the API
 * (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
 * @param {NodeJS.ProcessEnv} env
 */
export function createR2Client(env) {
  const missing = R2_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing R2 settings: ${missing.join(", ")}`);
  }
  const endpoint = new URL(env.R2_ENDPOINT.trim());
  const bucket = env.R2_BUCKET.trim();
  const credentials = {
    accessKeyId: env.R2_ACCESS_KEY_ID.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY.trim(),
    region: "auto",
  };

  const send = async ({ method, key = "", query, headers, body }) => {
    const signed = signS3Request({
      ...credentials,
      method,
      host: endpoint.host,
      path: `/${bucket}${key ? `/${key}` : ""}`,
      query,
      headers,
      payloadHash: sha256Hex(body ?? ""),
      amzDate: amzDateNow(),
    });
    return fetch(signed.url, { method, headers: signed.headers, body });
  };

  return {
    /**
     * @param {string} key
     * @param {Buffer} body
     * @param {string} contentType
     */
    async putObject(key, body, contentType) {
      const response = await send({
        method: "PUT",
        key,
        headers: { "content-type": contentType },
        body,
      });
      if (!response.ok) {
        throw new Error(`R2 put ${key} failed with HTTP ${response.status}`);
      }
    },
    /**
     * @param {string} key
     * @returns {Promise<Buffer | null>} null when the object does not exist
     */
    async getObject(key) {
      const response = await send({ method: "GET", key });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`R2 get ${key} failed with HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    },
    /**
     * @param {string} prefix
     * @returns {Promise<string[]>} every key under the prefix
     */
    async listKeys(prefix) {
      const keys = [];
      let token;
      do {
        const query = {
          "list-type": "2",
          prefix,
          ...(token ? { "continuation-token": token } : {}),
        };
        const response = await send({ method: "GET", query });
        if (!response.ok) {
          throw new Error(`R2 list ${prefix} failed with HTTP ${response.status}`);
        }
        const page = parseListObjects(await response.text());
        keys.push(...page.keys);
        token = page.nextToken;
      } while (token);
      return keys;
    },
  };
}

const XML_ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/**
 * @param {string} xml a ListObjectsV2 response body
 * @returns {{ keys: string[], nextToken: string | undefined }}
 */
export function parseListObjects(xml) {
  const decode = (text) =>
    text.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]);
  const keys = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((match) => decode(match[1]));
  const next = /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml);
  return { keys, nextToken: next ? decode(next[1]) : undefined };
}
