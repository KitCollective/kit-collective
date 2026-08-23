import type { CollectionJersey, CollectionShortcut } from "@kit/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AccessibilityActionEvent,
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
const MANAGE_ROW_HEIGHT = 52;

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
  const [orderedShortcuts, setOrderedShortcuts] = useState<CollectionShortcut[]>([]);
  const [draggingShortcutId, setDraggingShortcutId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const dragStartIndexRef = useRef(0);

  const loadShortcuts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchCollectionShortcuts(accessToken);
      setShortcuts(response.shortcuts);
      setOrderedShortcuts(response.shortcuts);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!draggingShortcutId) {
      setOrderedShortcuts(shortcuts);
    }
  }, [shortcuts, draggingShortcutId]);

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
      setOrderedShortcuts(response.shortcuts);
      onShortcutsChanged();
    } finally {
      setReordering(false);
    }
  };

  const applyShortcutMove = (fromIndex: number, toIndex: number) => {
    const orderedIds = reorderShortcutIds(orderedShortcuts, fromIndex, toIndex);
    if (orderedIds.join() === orderedShortcuts.map((shortcut) => shortcut.id).join()) {
      return orderedIds;
    }

    setOrderedShortcuts(
      orderedIds
        .map((id) => orderedShortcuts.find((shortcut) => shortcut.id === id))
        .filter((shortcut): shortcut is CollectionShortcut => shortcut !== undefined),
    );
    return orderedIds;
  };

  const moveShortcut = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    const orderedIds = applyShortcutMove(fromIndex, toIndex);
    if (orderedIds.join() === shortcuts.map((shortcut) => shortcut.id).join()) {
      return;
    }

    void persistReorder(orderedIds);
  };

  const updateDragPosition = (shortcutId: string, offsetY: number) => {
    const currentIndex = orderedShortcuts.findIndex((shortcut) => shortcut.id === shortcutId);
    if (currentIndex < 0) {
      return;
    }

    setDragOffsetY(offsetY);

    const targetIndex = Math.min(
      orderedShortcuts.length - 1,
      Math.max(
        0,
        dragStartIndexRef.current +
          Math.floor((offsetY + MANAGE_ROW_HEIGHT / 2) / MANAGE_ROW_HEIGHT),
      ),
    );

    if (targetIndex !== currentIndex) {
      applyShortcutMove(currentIndex, targetIndex);
    }
  };

  const finishDrag = () => {
    const orderedIds = orderedShortcuts.map((shortcut) => shortcut.id);
    const persistedIds = shortcuts.map((shortcut) => shortcut.id);
    setDraggingShortcutId(null);
    setDragOffsetY(0);

    if (orderedIds.join() !== persistedIds.join()) {
      void persistReorder(orderedIds);
    }
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
                {orderedShortcuts.map((shortcut, index) => {
                  const isDragging = draggingShortcutId === shortcut.id;
                  const currentIndex = orderedShortcuts.findIndex((row) => row.id === shortcut.id);
                  const dragTranslateY = isDragging
                    ? dragOffsetY - (currentIndex - dragStartIndexRef.current) * MANAGE_ROW_HEIGHT
                    : 0;

                  return (
                    <View
                      key={shortcut.id}
                      style={[
                        styles.manageRow,
                        isDragging && styles.manageRowDragging,
                        isDragging ? { transform: [{ translateY: dragTranslateY }] } : null,
                      ]}
                    >
                      <ShortcutDragHandle
                        color={theme.contentMuted}
                        onMove={(direction) => moveShortcut(index, direction)}
                        onDragStart={() => {
                          dragStartIndexRef.current = index;
                          setDraggingShortcutId(shortcut.id);
                          setDragOffsetY(0);
                        }}
                        onDragMove={(offsetY) => updateDragPosition(shortcut.id, offsetY)}
                        onDragEnd={() => finishDrag()}
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
                  );
                })}
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
                  title={
                    facets[facetKind]?.label ??
                    `Vælg ${resolveFacetFieldLabel(facetKind).toLowerCase()}`
                  }
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
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  color: string;
  onMove: (direction: -1 | 1) => void;
  onDragStart: () => void;
  onDragMove: (offsetY: number) => void;
  onDragEnd: () => void;
}) {
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        onDragStart();
      },
      onPanResponderMove: (_, gesture) => {
        onDragMove(gesture.dy);
      },
      onPanResponderRelease: () => {
        onDragEnd();
      },
      onPanResponderTerminate: () => {
        onDragEnd();
      },
    }),
  ).current;

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case "increment":
        onMove(1);
        break;
      case "decrement":
        onMove(-1);
        break;
      default:
        break;
    }
  };

  return (
    <View
      style={styles.dragHandle}
      accessible
      accessibilityLabel="Flyt"
      accessibilityActions={[
        { name: "increment", label: "Flyt ned" },
        { name: "decrement", label: "Flyt op" },
      ]}
      onAccessibilityAction={handleAccessibilityAction}
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
  manageRowDragging: {
    zIndex: 1,
    elevation: 2,
    opacity: 0.92,
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
