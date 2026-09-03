import type { VisionJobResponse, VisionSuggestions } from "@kit/api-contract";
import { KIT_TYPE_LABELS_DA, PHOTO_ROLES, type PhotoRole } from "@kit/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchUnsignedVisionJob, startUnsignedVisionSuggest } from "@/api/vision";
import { loadPersistedCaptureSession } from "@/capture/captureFlow";
import { getActiveDraft, photoUriForRole } from "@/capture/captureSession";
import { readPhotoBase64 } from "@/capture/photoBytes";
import { PhotoSlot } from "@/components/photo-slot";
import { Button, ButtonDock } from "@/components/ui";
import {
  ANALYSING_CAPTION,
  ANALYSING_FILL_SELF_LABEL,
  ANALYSING_RESULT_CLUB_LABEL,
  ANALYSING_RESULT_SEASON_LABEL,
  ANALYSING_RESULT_TYPE_LABEL,
  ANALYSING_TITLE,
} from "@/first-session/analysing-copy";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const VISION_TIMEOUT_MS = 12_000;
const VISION_POLL_MS = 2_000;

type FirstSessionAnalysingScreenProps = {
  captureSessionId: string;
  onVisionComplete: () => void;
  onVisionFailed: () => void;
  onFillSelf: () => void;
};

function firstVisionPhoto(
  photoUris: Partial<Record<PhotoRole, string>>,
): { role: PhotoRole; uri: string } | null {
  for (const role of PHOTO_ROLES) {
    const uri = photoUris[role];
    if (uri) {
      return { role, uri };
    }
  }
  return null;
}

function formatSuggestionRows(suggestions: VisionSuggestions): string[] {
  const rows: string[] = [];
  if (suggestions.clubLabel) {
    rows.push(`${ANALYSING_RESULT_CLUB_LABEL}: ${suggestions.clubLabel}`);
  }
  if (suggestions.seasonLabel) {
    rows.push(`${ANALYSING_RESULT_SEASON_LABEL}: ${suggestions.seasonLabel}`);
  }
  if (suggestions.type) {
    rows.push(`${ANALYSING_RESULT_TYPE_LABEL}: ${KIT_TYPE_LABELS_DA[suggestions.type]}`);
  }
  return rows;
}

const EMPTY_PHOTO_URIS: Partial<Record<PhotoRole, string>> = {};

export function FirstSessionAnalysingScreen({
  captureSessionId,
  onVisionComplete,
  onVisionFailed,
  onFillSelf,
}: FirstSessionAnalysingScreenProps) {
  const theme = useTheme();
  const typography = useTypography();
  const settledRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [suggestions, setSuggestions] = useState<VisionSuggestions | null>(null);

  const captureState = useMemo(
    () => loadPersistedCaptureSession(captureSessionId),
    [captureSessionId],
  );
  const draft = captureState ? getActiveDraft(captureState) : null;
  const photoUris = useMemo(() => {
    if (!draft) {
      return EMPTY_PHOTO_URIS;
    }

    return PHOTO_ROLES.reduce<Partial<Record<PhotoRole, string>>>((acc, role) => {
      const uri = photoUriForRole(draft, role);
      if (uri) {
        acc[role] = uri;
      }
      return acc;
    }, {});
  }, [draft]);

  const settle = useCallback((handler: () => void) => {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    setProgress(1);
    handler();
  }, []);

  useEffect(() => {
    const firstPhoto = firstVisionPhoto(photoUris);
    if (!firstPhoto) {
      settle(onVisionFailed);
      return;
    }

    let cancelled = false;
    let jobId: string | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled || !jobId) {
        return;
      }

      if (Date.now() - startedAt >= VISION_TIMEOUT_MS) {
        settle(onVisionFailed);
        return;
      }

      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(0.9, elapsed / VISION_TIMEOUT_MS));

      try {
        const job: VisionJobResponse = await fetchUnsignedVisionJob(jobId);
        if (cancelled) {
          return;
        }

        if (job.status === "pending") {
          return;
        }

        if (job.status === "ready" && job.suggestions) {
          setSuggestions(job.suggestions);
          settle(onVisionComplete);
          return;
        }

        settle(onVisionFailed);
      } catch {
        if (!cancelled) {
          settle(onVisionFailed);
        }
      }
    };

    void (async () => {
      try {
        const contentBase64 = await readPhotoBase64(firstPhoto.uri);
        jobId = await startUnsignedVisionSuggest({
          draftId: captureSessionId,
          photo: { role: firstPhoto.role, contentBase64 },
        });
      } catch {
        if (!cancelled) {
          settle(onVisionFailed);
        }
        return;
      }

      interval = setInterval(() => {
        void poll();
      }, VISION_POLL_MS);
      void poll();
    })();

    return () => {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [captureSessionId, onVisionComplete, onVisionFailed, photoUris, settle]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.canvas }]}>
      <View style={styles.body}>
        <Text style={[typography.title, { color: theme.contentPrimary }]}>{ANALYSING_TITLE}</Text>
        <Text style={[typography.body, { color: theme.contentSecondary }]}>
          {ANALYSING_CAPTION}
        </Text>

        <View style={[styles.progressTrack, { backgroundColor: theme.borderSubtle }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.contentPrimary,
                width: `${Math.round(progress * 100)}%`,
              },
            ]}
          />
        </View>

        <View style={styles.photoRow}>
          {PHOTO_ROLES.map((role) => (
            <PhotoSlot key={role} role={role} uri={photoUris[role]} onPress={() => {}} />
          ))}
        </View>

        {suggestions ? (
          <View style={styles.results}>
            {formatSuggestionRows(suggestions).map((row) => (
              <Text key={row} style={[typography.body, { color: theme.contentSecondary }]}>
                {row}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <ButtonDock>
        <Button
          label={ANALYSING_FILL_SELF_LABEL}
          variant="tertiary"
          width="fill"
          onPress={onFillSelf}
        />
      </ButtonDock>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.insetLg,
    paddingTop: space.insetLg,
    gap: space.gapMd,
  },
  progressTrack: {
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: StyleSheet.hairlineWidth,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  progressFill: {
    height: "100%",
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.gapMd,
    justifyContent: "center",
  },
  results: {
    gap: space.gapSm,
  },
});
