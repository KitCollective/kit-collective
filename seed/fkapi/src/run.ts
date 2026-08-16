import { parseCliArgs } from "./cli-args.js";
import { createFkApiFetchAdapter } from "./fetch.js";
import { runFkSeed } from "./mapper.js";
import type { ObjectStoreAdapter } from "./types.js";

export type RunCliOptions = {
  argv: string[];
  databaseUrl: string;
  fetchAdapter?: import("./types.js").FkFetchAdapter;
  objectStore?: ObjectStoreAdapter;
};

export async function runCli(options: RunCliOptions): Promise<void> {
  const parsed = parseCliArgs(options.argv);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const fetchAdapter = options.fetchAdapter ?? createFkApiFetchAdapter();
  const objectStore = options.objectStore ?? createR2ObjectStore();

  const result = await runFkSeed({
    databaseUrl: options.databaseUrl,
    fetchAdapter,
    objectStore,
    scope: {
      competition: parsed.args.competition,
      fromSeason: parsed.args.fromSeason,
      toSeason: parsed.args.toSeason,
    },
  });

  console.log(
    JSON.stringify({
      lane: parsed.args.lane,
      competition: parsed.args.competition,
      fromSeason: parsed.args.fromSeason,
      toSeason: parsed.args.toSeason,
      kitsUpserted: result.kitsUpserted,
      photosWritten: result.photosWritten,
    }),
  );
}

function createR2ObjectStore(): ObjectStoreAdapter {
  return {
    async putObject(key: string, bytes: Uint8Array): Promise<void> {
      const endpoint = process.env.R2_ENDPOINT;
      const bucket = process.env.R2_BUCKET;
      const accessKey = process.env.R2_ACCESS_KEY_ID;
      const secretKey = process.env.R2_SECRET_ACCESS_KEY;

      if (!endpoint || !bucket || !accessKey || !secretKey) {
        throw new Error(
          "R2 credentials missing. Set R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.",
        );
      }

      const url = `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
          Authorization: `Basic ${Buffer.from(`${accessKey}:${secretKey}`).toString("base64")}`,
        },
        body: Buffer.from(bytes),
      });

      if (!response.ok) {
        throw new Error(`R2 upload failed: ${response.status} ${response.statusText}`);
      }
    },
  };
}
