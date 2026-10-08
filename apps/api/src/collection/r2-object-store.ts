import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectStoreAdapter } from "./object-store.js";

/** R2 / S3-compatible object store using AWS SigV4 (not HTTP Basic). */
export function createR2ObjectStore(): ObjectStoreAdapter {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error(
      "R2 credentials missing. Set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: true,
  });

  return {
    async putObject(key: string, bytes: Uint8Array): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: "image/jpeg",
        }),
      );
    },
    async objectExists(key: string): Promise<boolean> {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        return true;
      } catch {
        return false;
      }
    },
    async getObject(key: string): Promise<Uint8Array | null> {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        const body = response.Body;
        if (!body) {
          return null;
        }
        return Uint8Array.from(await body.transformToByteArray());
      } catch {
        return null;
      }
    },
    async deleteObject(key: string): Promise<void> {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    },
  };
}
