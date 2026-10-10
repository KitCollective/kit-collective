import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { evidenceBucketEnv, parseListObjects, signS3Request } from "../e2e/r2.mjs";

// Worked examples from AWS "Signature Calculations for the Authorization
// Header" (Signature Version 4, S3). The expected signatures are AWS's.
const credentials = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
};
const EMPTY_HASH = createHash("sha256").update("").digest("hex");

test("signs the AWS GET Object example", () => {
  const { authorization } = signS3Request({
    ...credentials,
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    headers: { range: "bytes=0-9" },
    payloadHash: EMPTY_HASH,
    amzDate: "20130524T000000Z",
  });
  assert.equal(
    authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

test("signs the AWS List Objects example with a sorted query", () => {
  const { authorization } = signS3Request({
    ...credentials,
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/",
    query: { prefix: "J", "max-keys": "2" },
    payloadHash: EMPTY_HASH,
    amzDate: "20130524T000000Z",
  });
  assert.match(
    authorization,
    /Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/,
  );
});

test("reads keys and the continuation token from a ListObjectsV2 page", () => {
  const page = parseListObjects(
    `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated>` +
      `<Contents><Key>e2e/abc/collection/01-collection.png</Key><Size>1</Size></Contents>` +
      `<Contents><Key>e2e/abc/a&amp;b.png</Key></Contents>` +
      `<NextContinuationToken>tok/1==</NextContinuationToken></ListBucketResult>`,
  );
  assert.deepEqual(page.keys, ["e2e/abc/collection/01-collection.png", "e2e/abc/a&b.png"]);
  assert.equal(page.nextToken, "tok/1==");
  assert.equal(parseListObjects("<ListBucketResult/>").nextToken, undefined);
});

test("evidence goes to its own bucket, never the lane bucket", () => {
  const env = { R2_BUCKET: "kc-development", R2_ENDPOINT: "https://account.example" };
  assert.throws(() => evidenceBucketEnv(env), /E2E_R2_BUCKET/);
  assert.throws(
    () => evidenceBucketEnv({ ...env, E2E_R2_BUCKET: "kc-development" }),
    /lane bucket/,
  );
  assert.deepEqual(evidenceBucketEnv({ ...env, E2E_R2_BUCKET: " kc-e2e-evidence " }), {
    ...env,
    E2E_R2_BUCKET: " kc-e2e-evidence ",
    R2_BUCKET: "kc-e2e-evidence",
  });
});
