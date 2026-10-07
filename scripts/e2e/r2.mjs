/**
 * Lane R2 access for device-flow evidence (KIT-267): S3 Signature Version 4
 * over fetch. Dependency-free so it runs on an EAS worker without an install.
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
