import assert from "node:assert/strict";
import { test } from "node:test";
import { compareRuns, diffImages, stepKey } from "../e2e/compare.mjs";
import { decodePng, encodePng } from "../e2e/png.mjs";

/** Solid image with optional painted rectangles: [x, y, w, h, [r, g, b]]. */
function image(width, height, base, rects = []) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set([...base, 255], i * 4);
  }
  for (const [x, y, w, h, colour] of rects) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        data.set([...colour, 255], (yy * width + xx) * 4);
      }
    }
  }
  return encodePng({ width, height, data });
}

const PAPER = [245, 240, 230];
const INK = [20, 20, 20];

test("png round-trips RGBA pixels", () => {
  const png = image(3, 2, PAPER, [[1, 0, 1, 1, INK]]);
  const decoded = decodePng(png);
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 2);
  assert.deepEqual([...decoded.data.subarray(0, 8)], [245, 240, 230, 255, 20, 20, 20, 255]);
});

test("png decoder refuses a file that is not a PNG", () => {
  assert.throws(() => decodePng(Buffer.from("not a png")), /not a PNG/);
});

test("identical images have no differing pixels", () => {
  const a = image(100, 200, PAPER);
  const result = diffImages(a, image(100, 200, PAPER));
  assert.equal(result.differingPixels, 0);
  assert.equal(result.sizeMismatch, false);
});

test("a per-channel wobble inside the tolerance is not a difference", () => {
  const a = image(100, 200, PAPER);
  const b = image(100, 200, [247, 238, 232]);
  assert.equal(diffImages(a, b).differingPixels, 0);
});

test("a one-step tint of the whole screen is a difference on every compared pixel", () => {
  // A surface token nudged from #F4F4F4 to #FFFFFF moves each channel by 11.
  const a = image(100, 200, [244, 244, 244]);
  const b = image(100, 200, [255, 255, 255]);
  const result = diffImages(a, b);
  assert.equal(result.differingPixels, result.comparedPixels);
});

test("a repainted block is counted, outside the ignored top strip only", () => {
  const a = image(100, 200, PAPER);
  // 10x10 block in the status-bar strip (ignored) and a 20x10 block in the body.
  const b = image(100, 200, PAPER, [
    [0, 0, 10, 10, INK],
    [40, 100, 20, 10, INK],
  ]);
  const result = diffImages(a, b);
  assert.equal(result.differingPixels, 200);
  assert.equal(result.comparedPixels, 100 * (200 - 15));
});

test("different dimensions are a size mismatch", () => {
  const result = diffImages(image(100, 200, PAPER), image(100, 220, PAPER));
  assert.equal(result.sizeMismatch, true);
});

test("compareRuns marks same, changed, new and removed per flow step", () => {
  const before = new Map([
    [stepKey("collection", "01-list"), image(100, 200, PAPER)],
    [stepKey("collection", "02-detail"), image(100, 200, PAPER)],
    [stepKey("search", "01-old"), image(100, 200, PAPER)],
  ]);
  const after = new Map([
    [stepKey("collection", "01-list"), image(100, 200, PAPER)],
    [stepKey("collection", "02-detail"), image(100, 200, PAPER, [[10, 50, 60, 60, INK]])],
    [stepKey("wishlist", "01-new"), image(100, 200, PAPER)],
  ]);
  const pairs = compareRuns(before, after);
  assert.deepEqual(
    pairs.map((p) => [p.flow, p.step, p.status]),
    [
      ["collection", "01-list", "same"],
      ["collection", "02-detail", "changed"],
      ["search", "01-old", "removed"],
      ["wishlist", "01-new", "new"],
    ],
  );
});

test("tolerance edge: at the pixel count it is same, one pixel over it is changed", () => {
  const base = image(100, 200, PAPER);
  const at = image(100, 200, PAPER, [[0, 100, 24, 1, INK]]);
  const over = image(100, 200, PAPER, [[0, 100, 25, 1, INK]]);
  const key = stepKey("f", "s");
  assert.equal(compareRuns(new Map([[key, base]]), new Map([[key, at]]))[0].status, "same");
  assert.equal(compareRuns(new Map([[key, base]]), new Map([[key, over]]))[0].status, "changed");
});

test("an icon-sized change on a full-size screenshot is changed", () => {
  // 18x18 pt at 3x on a 1206x2622 screen: far below any share-of-screen threshold.
  const key = stepKey("f", "s");
  const before = new Map([[key, image(1206, 2622, PAPER)]]);
  const after = new Map([[key, image(1206, 2622, PAPER, [[600, 1300, 54, 54, INK]])]]);
  assert.equal(compareRuns(before, after)[0].status, "changed");
});

test("a size mismatch is changed", () => {
  const key = stepKey("f", "s");
  const pairs = compareRuns(
    new Map([[key, image(100, 200, PAPER)]]),
    new Map([[key, image(100, 220, PAPER)]]),
  );
  assert.equal(pairs[0].status, "changed");
});
