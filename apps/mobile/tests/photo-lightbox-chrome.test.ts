import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lightboxPath = join(__dirname, "../src/components/photo-lightbox.tsx");
const confirmPath = join(__dirname, "../app/(capture)/confirm.tsx");
const photoSlotPath = join(__dirname, "../src/components/photo-slot.tsx");

describe("Photo lightbox chrome", () => {
  it("renders a 4:5 preview with top-left Luk and destructive Slet separate from Erstat", () => {
    const source = readFileSync(lightboxPath, "utf8");

    expect(source).toContain("previewHeight = (previewWidth * 5) / 4");
    expect(source).toContain('accessibilityLabel="Luk"');
    expect(source).toContain('name="close"');
    expect(source).toContain("ButtonDock");
    expect(source).toContain('label="Erstat"');
    expect(source).toContain('variant="secondary"');
    expect(source).toContain('label="Slet"');
    expect(source).toContain('variant="destructive"');
    expect(source).toContain("Skift rolle");
    expect(source).toContain("PHOTO_ROLES");
  });

  it("locks role chips to front, back, and label only", () => {
    const source = readFileSync(lightboxPath, "utf8");

    expect(source).toContain("PHOTO_ROLE_LABELS_DA");
    expect(source).not.toContain("left");
    expect(source).not.toContain("right");
  });
});

describe("Confirm photo slot behaviour", () => {
  it("opens the lightbox for a filled slot and the picker for an empty slot", () => {
    const source = readFileSync(confirmPath, "utf8");

    expect(source).toContain("PhotoLightbox");
    expect(source).toContain("setLightboxRole(role)");
    expect(source).toContain("pickPhotoForRole(role)");
    expect(source).toContain("bindUnboundPhotoToDraft");
    expect(source).not.toContain("unbindPhoto(current, uri)");
    expect(source).toContain("removeDraftPhoto");
    expect(source).toContain("changeDraftPhotoRole");
    expect(source).toContain("upsertDraftPhoto");
  });

  it("keeps Photo slot as the confirm-strip primitive with 4:5 tiles", () => {
    const source = readFileSync(photoSlotPath, "utf8");

    expect(source).toContain("confirm-strip");
    expect(source).toContain("photoSlotHeight");
    expect(source).toContain("(width * 5) / 4");
  });
});
