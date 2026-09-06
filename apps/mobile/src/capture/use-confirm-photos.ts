import type { PhotoRole } from "@kit/domain";
import { PHOTO_ROLES } from "@kit/domain";
import { useEffect, useState } from "react";
import {
  appendUnboundPhotos,
  bindUnboundPhotoToDraft,
  changeDraftPhotoRole,
  discardUnboundPhoto,
  photoUriForRole,
  removeDraftPhoto,
  upsertDraftPhoto,
} from "@/capture/captureSession";
import type {
  CaptureJerseyDraft,
  CaptureSessionMutator,
  CaptureSessionState,
} from "@/capture/captureSessionTypes";
import { resolveConfirmLightboxUri, resolveConfirmStripUri } from "@/capture/confirmPhotoUri";
import { expoGalleryPickerAdapter, expoUploadFilesAdapter } from "@/capture/expoPickerAdapters";
import { captureQualityForRole } from "@/capture/photoBytes";
import { pickGalleryPhotos } from "@/capture/pickGalleryPhotos";
import { pickUploadFiles } from "@/capture/pickUploadFiles";

type UseConfirmPhotosOptions = {
  sessionId: string | undefined;
  state: CaptureSessionState | null;
  draft: CaptureJerseyDraft | null;
  isBulk: boolean;
  mutate: CaptureSessionMutator;
  onFirstSinglePhoto: (role: PhotoRole, uri: string) => void;
};

/** Owns Confirm's picker, sandbox binding, and lightbox photo actions. */
export function useConfirmPhotos({
  sessionId,
  state,
  draft,
  isBulk,
  mutate,
  onFirstSinglePhoto,
}: UseConfirmPhotosOptions) {
  const [lightboxRole, setLightboxRole] = useState<PhotoRole | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | undefined>(undefined);
  const [stripPhotoUris, setStripPhotoUris] = useState<Record<PhotoRole, string | undefined>>({
    front: undefined,
    back: undefined,
    left: undefined,
    right: undefined,
    other: undefined,
  });

  useEffect(() => {
    if (!draft) {
      setStripPhotoUris({
        front: undefined,
        back: undefined,
        left: undefined,
        right: undefined,
        other: undefined,
      });
      return;
    }

    let cancelled = false;
    void Promise.all(
      PHOTO_ROLES.map(async (role) => {
        const uri = photoUriForRole(draft, role);
        if (!uri) {
          return [role, undefined] as const;
        }
        try {
          const stripUri = await resolveConfirmStripUri(uri, role);
          return [role, stripUri] as const;
        } catch {
          return [role, uri] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      const next: Record<PhotoRole, string | undefined> = {
        front: undefined,
        back: undefined,
        left: undefined,
        right: undefined,
        other: undefined,
      };
      for (const [role, uri] of entries) {
        next[role] = uri;
      }
      setStripPhotoUris(next);
    });

    return () => {
      cancelled = true;
    };
  }, [draft]);

  useEffect(() => {
    if (!draft || !lightboxRole) {
      setLightboxUri(undefined);
      return;
    }

    const sourceUri = photoUriForRole(draft, lightboxRole);
    if (!sourceUri) {
      setLightboxUri(undefined);
      return;
    }

    let cancelled = false;
    void resolveConfirmLightboxUri(sourceUri, lightboxRole)
      .then((uri) => {
        if (!cancelled) {
          setLightboxUri(uri);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLightboxUri(sourceUri);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft, lightboxRole]);

  const pickPhotoForRole = async (role: PhotoRole) => {
    if (!draft || !sessionId) {
      return;
    }

    const hadPhotos = draft.photos.length > 0;
    const uris = await pickGalleryPhotos(
      { quality: captureQualityForRole(role) },
      expoGalleryPickerAdapter,
    );
    const uri = uris?.[0];
    if (!uri) {
      return;
    }

    mutate((current) => upsertDraftPhoto(current, current.activeDraftId, role, uri, "gallery"));
    if (!isBulk && !hadPhotos) {
      onFirstSinglePhoto(role, uri);
    }
  };

  const handlePhotoSlotPress = (role: PhotoRole) => {
    if (!state || !draft) {
      return;
    }

    const uri = photoUriForRole(draft, role);
    if (uri) {
      setLightboxRole(role);
      return;
    }

    if (isBulk) {
      const firstUnbound = state.unboundUris[0];
      if (firstUnbound) {
        mutate((current) =>
          bindUnboundPhotoToDraft(current, firstUnbound, current.activeDraftId, role),
        );
      }
      return;
    }

    void pickPhotoForRole(role);
  };

  const replaceLightboxPhoto = () => {
    if (!lightboxRole) {
      return;
    }
    const role = lightboxRole;
    setLightboxRole(null);
    void pickPhotoForRole(role);
  };

  const deleteLightboxPhoto = () => {
    if (!lightboxRole) {
      return;
    }
    mutate((current) => removeDraftPhoto(current, current.activeDraftId, lightboxRole));
    setLightboxRole(null);
  };

  const changeLightboxPhotoRole = (toRole: PhotoRole) => {
    if (!lightboxRole) {
      return;
    }
    mutate((current) => changeDraftPhotoRole(current, current.activeDraftId, lightboxRole, toRole));
    setLightboxRole(toRole);
  };

  const uploadToSandbox = async () => {
    const uris = await pickUploadFiles({ allowsMultipleSelection: true }, expoUploadFilesAdapter);
    if (uris?.length) {
      mutate((current) => appendUnboundPhotos(current, uris));
    }
  };

  return {
    photoUris: stripPhotoUris,
    lightboxRole,
    lightboxUri,
    dismissLightbox: () => setLightboxRole(null),
    handlePhotoSlotPress,
    replaceLightboxPhoto,
    deleteLightboxPhoto,
    changeLightboxPhotoRole,
    bindUnboundPhoto: (uri: string) => {
      mutate((current) => bindUnboundPhotoToDraft(current, uri, current.activeDraftId));
    },
    discardUnboundPhoto: (uri: string) => {
      mutate((current) => discardUnboundPhoto(current, uri));
    },
    uploadToSandbox,
  };
}
