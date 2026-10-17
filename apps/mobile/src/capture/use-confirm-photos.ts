import type { PhotoRole } from "@kit/domain";
import { PHOTO_ROLES } from "@kit/domain";
import { useEffect, useRef, useState } from "react";
import {
  addPhotosToDraft,
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
import {
  type ConfirmStripPhotos,
  type ConfirmStripSources,
  createConfirmStripPhotos,
  resolveConfirmLightboxUri,
  resolveConfirmStripUri,
} from "@/capture/confirmPhotoUri";
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
  const [, setStripTick] = useState(0);
  const stripRef = useRef<ConfirmStripPhotos | null>(null);
  stripRef.current ??= createConfirmStripPhotos(resolveConfirmStripUri, () =>
    setStripTick((tick) => tick + 1),
  );
  const strip = stripRef.current;

  // SAFETY: PHOTO_ROLES lists every PhotoRole, so the entries cover the whole record.
  const stripSources = Object.fromEntries(
    PHOTO_ROLES.map((role) => [
      role,
      draft ? (photoUriForRole(draft, role) ?? undefined) : undefined,
    ]),
  ) as ConfirmStripSources;
  const stripSourcesKey = PHOTO_ROLES.map((role) => stripSources[role] ?? "").join("\n");

  // Keyed on the URIs, not the draft: a new draft object with the same photos starts no prepare.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stripSourcesKey stands for stripSources
  useEffect(() => {
    strip.update(stripSources);
  }, [stripSourcesKey]);

  useEffect(() => () => strip.dispose(), [strip]);

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

  /** The Foto tile: picked photos join this jersey by fill order, up to the 10 cap. */
  const addPhoto = async () => {
    if (!draft) {
      return;
    }
    const uris = await pickUploadFiles({ allowsMultipleSelection: true }, expoUploadFilesAdapter);
    if (uris?.length) {
      mutate((current) => addPhotosToDraft(current, current.activeDraftId, uris));
    }
  };

  return {
    photoUris: strip.uris(stripSources),
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
    addPhoto,
  };
}
