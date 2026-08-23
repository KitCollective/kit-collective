import type { CollectionJersey, CollectionShortcut } from "@kit/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createCollectionShortcut,
  deleteCollectionShortcut,
  fetchCollectionShortcuts,
  reorderCollectionShortcuts,
  updateCollectionShortcut,
} from "@/api/shortcuts";
import { ListRow, Sheet } from "@/components/catalog-ui";
import { FacetPickerOverlay } from "@/components/facet-picker-overlay";
import {
  buildGenvejeWritePayload,
  canSaveGenvej,
  deriveMostUsedFacets,
  emptyGenvejeFacets,
  GENVEJE_AND_HELPER_COPY,
  type GenvejeFacetKind,
  type GenvejeFacets,
  type GenvejeSheetMode,
  manageRowAccessibilityLabel,
  reorderShortcutIds,
  resolveFacetFieldLabel,
  resolveGenvejeSheetTitle,
  seedFacetsForEdit,
  shouldResetShortcutAfterDelete,
  shouldResetToAlleAfterGem,
} from "@/components/genveje-sheet-logic";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

const FACET_FIELDS: GenvejeFacetKind[] = ["country", "league", "club", "player"];

type GenvejeSheetProps = {
  visible: boolean;
  accessToken: string;
  activeShortcutId: string | null;
  ownerJerseys: CollectionJersey[];
  onDismiss: () => void;
  onShortcutsChanged: () => void;
  onShortcutSaved: () => void;
  onShortcutDeleted: (shortcutId: string) => void;
};

export function GenvejeSheet({
  visible,
  accessToken,
  activeShortcutId,
  ownerJerseys,
  onDismiss,
  onShortcutsChanged,
  onShortcutSaved,
  onShortcutDeleted,
}: GenvejeSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const [mode, setMode] = useState<GenvejeSheetMode>("list");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [shortcuts, setShortcuts] = useState<CollectionShortcut[]>([]);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [facets, setFacets] = useState<GenvejeFacets>(emptyGenvejeFacets());
  const [openFacetPicker, setOpenFacetPicker] = useState<GenvejeFacetKind | null>(null);

  const loadShortcuts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchCollectionShortcuts(accessToken);
      setShortcuts(response.shortcuts);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (visible) {
      setMode("list");
      setEditingShortcutId(null);
      setCustomName("");
      setFacets(emptyGenvejeFacets());
      setOpenFacetPicker(null);
      void loadShortcuts();
    }
  }, [visible, loadShortcuts]);

  const openCreateForm = () => {
    setEditingShortcutId(null);
    setCustomName("");
    setFacets(emptyGenvejeFacets());
    setMode("form");
  };

  const openEditForm = (shortcut: CollectionShortcut) => {
    setEditingShortcutId(shortcut.id);
    setCustomName(shortcut.name);
    setFacets(seedFacetsForEdit(shortcut));
    setMode("form");
  };

  const persistReorder = async (orderedIds: string[]) => {
    setReordering(true);
    try {
      const response = await reorderCollectionShortcuts(accessToken, orderedIds);
      setShortcuts(response.shortcuts);
      onShortcutsChanged();
    } finally {
      setReordering(false);
    }
  };

  const moveShortcut = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    const orderedIds = reorderShortcutIds(shortcuts, fromIndex, toIndex);
    if (orderedIds.join() === shortcuts.map((shortcut) => shortcut.id).join()) {
      return;
    }

    setShortcuts(
      orderedIds
        .map((id) => shortcuts.find((shortcut) => shortcut.id === id))
        .filter((shortcut): shortcut is CollectionShortcut => shortcut !== undefined),
    );
    void persistReorder(orderedIds);
  };

  const handleSave = async () => {
    if (!canSaveGenvej(facets, saving)) {
      return;
    }

    setSaving(true);
    try {
      const payload = buildGenvejeWritePayload(facets, customName);

      if (editingShortcutId) {
        await updateCollectionShortcut(accessToken, editingShortcutId, payload);
      } else {
        await createCollectionShortcut(accessToken, payload);
      }

      await loadShortcuts();
      onShortcutsChanged();
      if (shouldResetToAlleAfterGem()) {
        onShortcutSaved();
      }
      setMode("list");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (shortcutId: string) => {
    await deleteCollectionShortcut(accessToken, shortcutId);
    if (shouldResetShortcutAfterDelete(shortcutId, activeShortcutId)) {
      onShortcutDeleted(shortcutId);
    }
    await loadShortcuts();
    onShortcutsChanged();
  };

  const sheetTitle = resolveGenvejeSheetTitle(mode);
  const canSave = canSaveGenvej(facets, saving);

  return (
    <>
      <Sheet
        visible={visible}
        title={sheetTitle}
        onDismiss={() => {
          if (mode === "form") {
            setMode("list");
            return;
          }
          onDismiss();
        }}
      >
        {mode === "list" ? (
          <View style={styles.listBody}>
            {loading || reordering ? (
              <ActivityIndicator color={theme.fillPrimary} />
            ) : (
              <ScrollView>
                {shortcuts.map((shortcut, index) => (
                  <View key={shortcut.id} style={styles.manageRow}>
                    <ShortcutDragHandle
                      color={theme.contentMuted}
                      onMove={(direction) => moveShortcut(index, direction)}
                    />
                    <View
                      style={styles.manageMain}
                      accessible
                      accessibilityLabel={manageRowAccessibilityLabel(
                        shortcut.name,
                        shortcut.matchCount,
                      )}
                    >
                      <Text
                        style={[typography.body, { color: theme.contentPrimary }]}
                        importantForAccessibility="no-hide-descendants"
                      >
                        {shortcut.name}
                      </Text>
                      <Text
                        style={[typography.mono, { color: theme.contentMuted }]}
                        importantForAccessibility="no-hide-descendants"
                      >
                        {shortcut.matchCount}
                      </Text>
                    </View>
                    <IconButton
                      name="Rediger"
                      icon="create-outline"
                      onPress={() => openEditForm(shortcut)}
                    />
                    <IconButton
                      name="Slet"
                      icon="trash-outline"
                      onPress={() => void handleDelete(shortcut.id)}
                    />
                  </View>
                ))}
              </ScrollView>
            )}
            <Button label="Tilføj" variant="primary" width="fill" onPress={openCreateForm} />
          </View>
        ) : (
          <View style={styles.formBody}>
            <Text style={[typography.body, { color: theme.contentSecondary }]}>
              {GENVEJE_AND_HELPER_COPY}
            </Text>

            {FACET_FIELDS.map((facetKind) => (
              <View key={facetKind} style={styles.field}>
                <Text style={[typography.label, { color: theme.contentPrimary }]}>
                  {resolveFacetFieldLabel(facetKind)}
                </Text>
                <ListRow
                  title={facets[facetKind]?.label ?? `Vælg ${resolveFacetFieldLabel(facetKind).toLowerCase()}`}
                  onPress={() => setOpenFacetPicker(facetKind)}
                  selected={facets[facetKind] !== null}
                />
              </View>
            ))}

            <View style={styles.field}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>
                Navn (valgfrit)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  typography.body,
                  {
                    color: theme.contentPrimary,
                    borderColor: theme.borderSubtle,
                    backgroundColor: theme.surface,
                  },
                ]}
                placeholder="Eget navn"
                placeholderTextColor={theme.contentMuted}
                value={customName}
                onChangeText={setCustomName}
              />
            </View>

            <Button
              label="Gem"
              variant="primary"
              width="fill"
              loading={saving}
              disabled={!canSave}
              onPress={() => void handleSave()}
            />
          </View>
        )}
      </Sheet>

      {openFacetPicker ? (
        <FacetPickerOverlay
          visible={visible && openFacetPicker !== null}
          facetKind={openFacetPicker}
          accessToken={accessToken}
          selectedId={facets[openFacetPicker]?.id ?? null}
          mostUsed={deriveMostUsedFacets(openFacetPicker, ownerJerseys, shortcuts)}
          onSelect={(item) => {
            setFacets((current) => ({ ...current, [openFacetPicker]: item }));
          }}
          onDismiss={() => setOpenFacetPicker(null)}
        />
      ) : null}
    </>
  );
}

function ShortcutDragHandle({
  color,
  onMove,
}: {
  color: string;
  onMove: (direction: -1 | 1) => void;
}) {
  const movedRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        movedRef.current = false;
      },
      onPanResponderMove: (_, gesture) => {
        if (movedRef.current) {
          return;
        }

        if (gesture.dy < -36) {
          movedRef.current = true;
          onMove(-1);
        } else if (gesture.dy > 36) {
          movedRef.current = true;
          onMove(1);
        }
      },
      onPanResponderRelease: () => {
        movedRef.current = false;
      },
    }),
  ).current;

  return (
    <View
      style={styles.dragHandle}
      accessible
      accessibilityLabel="Flyt"
      {...panResponder.panHandlers}
    >
      <View style={[styles.dragBar, { backgroundColor: color }]} />
      <View style={[styles.dragBar, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  listBody: {
    gap: space.gapMd,
  },
  formBody: {
    gap: space.gapMd,
  },
  manageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.gapSm,
    minHeight: 44,
    paddingVertical: space.insetSm,
  },
  manageMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.gapMd,
  },
  field: {
    gap: space.gapSm,
  },
  textInput: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: space.insetMd,
    paddingVertical: space.insetSm,
  },
  dragHandle: {
    width: 20,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  dragBar: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
});
