import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 1500;

/**
 * A drawn shirt on a flat backdrop. Test data never uses a photograph, so no
 * Collector's photo can end up in a stored screenshot.
 */
export async function renderFixturePhoto(colour: string, back: boolean): Promise<Uint8Array> {
  const mark = back
    ? `<rect x="520" y="620" width="160" height="260" fill="#00000040"/>`
    : `<circle cx="760" cy="520" r="46" fill="#00000040"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="100%" height="100%" fill="#d9d4c8"/>
  <path d="M400 260 L160 400 L250 620 L360 560 L360 1260 L840 1260 L840 560 L950 620 L1040 400 L800 260 Q600 380 400 260 Z" fill="${colour}" stroke="#00000030" stroke-width="6"/>
  ${mark}
</svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
  return Uint8Array.from(jpeg);
}
