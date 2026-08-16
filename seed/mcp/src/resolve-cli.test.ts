import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSeedCliBin } from "./resolve-cli.ts";

describe("resolveSeedCliBin", () => {
  it("defaults to the sibling CLI bins when env is unset", () => {
    delete process.env.SEED_APIFY_BIN;
    delete process.env.SEED_FK_BIN;
    assert.match(resolveSeedCliBin("apify"), /seed\/apify\/bin\/seed\.mjs$/);
    assert.match(resolveSeedCliBin("fk"), /seed\/fkapi\/bin\/seed\.mjs$/);
  });

  it("honors SEED_APIFY_BIN and SEED_FK_BIN", () => {
    const previousApify = process.env.SEED_APIFY_BIN;
    const previousFk = process.env.SEED_FK_BIN;
    process.env.SEED_APIFY_BIN = "/tmp/apify-seed";
    process.env.SEED_FK_BIN = "/tmp/fk-seed";
    try {
      assert.equal(resolveSeedCliBin("apify"), "/tmp/apify-seed");
      assert.equal(resolveSeedCliBin("fk"), "/tmp/fk-seed");
    } finally {
      if (previousApify === undefined) {
        delete process.env.SEED_APIFY_BIN;
      } else {
        process.env.SEED_APIFY_BIN = previousApify;
      }
      if (previousFk === undefined) {
        delete process.env.SEED_FK_BIN;
      } else {
        process.env.SEED_FK_BIN = previousFk;
      }
    }
  });
});
