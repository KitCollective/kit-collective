import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ProductionLaneRejectedError,
  UnknownLaneError,
  prepareSeedRun,
} from "./prepare-seed-run.ts";

const superligaScope = {
  competition: "Superligaen",
  fromSeason: "0001",
  toSeason: "2026",
};

describe("prepareSeedRun", () => {
  it("targets the development database when the chat does not name a lane", () => {
    const run = prepareSeedRun("seed_apify", superligaScope);

    assert.equal(run.lane, "development");
    assert.deepEqual(run.argv, [
      "--competition",
      "Superligaen",
      "--from-season",
      "0001",
      "--to-season",
      "2026",
      "--lane",
      "development",
    ]);
  });

  it("uses staging only when that lane is named", () => {
    const run = prepareSeedRun("seed_fk", {
      ...superligaScope,
      lane: "staging",
    });

    assert.equal(run.cli, "fk");
    assert.equal(run.lane, "staging");
    assert.equal(run.argv.at(-1), "staging");
  });

  it("makes production impossible", () => {
    assert.throws(
      () =>
        prepareSeedRun("seed_apify", {
          ...superligaScope,
          lane: "production",
        }),
      ProductionLaneRejectedError,
    );
    assert.throws(
      () =>
        prepareSeedRun("seed_fk", {
          ...superligaScope,
          lane: "prod",
        }),
      ProductionLaneRejectedError,
    );
  });

  it("rejects an unknown lane instead of guessing staging", () => {
    assert.throws(
      () =>
        prepareSeedRun("seed_apify", {
          ...superligaScope,
          lane: "preview",
        }),
      UnknownLaneError,
    );
  });

  it("maps seed_apify to the Apify CLI and seed_fk to the FK CLI", () => {
    assert.equal(prepareSeedRun("seed_apify", superligaScope).cli, "apify");
    assert.equal(prepareSeedRun("seed_fk", superligaScope).cli, "fk");
  });
});
