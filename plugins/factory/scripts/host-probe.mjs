// A fixed, harmless script for the host-bundle spike: it only reads. It prints where
// it ran and which commit that checkout is on; the last line is the one the Factory records.
import { execFileSync } from "node:child_process";
import { hostname } from "node:os";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const head = git("rev-parse", "--short", "HEAD");
process.stdout.write(`host-probe: running on ${hostname()} in ${process.cwd()}\n`);
process.stdout.write(`host-probe ok branch=${branch} head=${head}\n`);
