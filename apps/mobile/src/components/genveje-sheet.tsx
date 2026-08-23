import type { CatalogPickerItem, CollectionShortcut } from "@kit/api-contract";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  createCollectionShortcut,
  deleteCollectionShortcut,
  fetchCollectionShortcuts,
  updateCollectionShortcut,
} from "@/api/shortcuts";
import { ListRow, Sheet } from "@/components/catalog-ui";
import { ClubPickerOverlay } from "@/components/club-picker-overlay";
import { Button, IconButton } from "@/components/ui";
import { useTypography } from "@/theme/brand-fonts";
import { space } from "@/theme/tokens";
import { useTheme } from "@/theme/use-theme";

type GenvejeSheetProps = {
  visible: boolean;
  accessToken: string;
  onDismiss: () => void;
  onShortcutsChanged: () => void;
};

type SheetMode = "list" | "form";

export function GenvejeSheet({
  visible,
  accessToken,
  onDismiss,
  onShortcutsChanged,
}: GenvejeSheetProps) {
  const theme = useTheme();
  const typography = useTypography();
  const [mode, setMode] = useState<SheetMode>("list");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shortcuts, setShortcuts] = useState<CollectionShortcut[]>([]);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [selectedClub, setSelectedClub] = useState<CatalogPickerItem | null>(null);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);

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
      setSelectedClub(null);
      void loadShortcuts();
    }
  }, [visible, loadShortcuts]);

  const openCreateForm = () => {
    setEditingShortcutId(null);
    setCustomName("");
    setSelectedClub(null);
    setMode("form");
  };

  const openEditForm = (shortcut: CollectionShortcut) => {
    setEditingShortcutId(shortcut.id);
    setCustomName(shortcut.name);
    setSelectedClub(shortcut.clubId ? { id: shortcut.clubId, label: "Valgt klub" } : null);
    setMode("form");
  };

  const handleSave = async () => {
    if (!selectedClub) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        clubId: selectedClub.id,
        ...(customName.trim() ? { name: customName.trim() } : {}),
      };

      if (editingShortcutId) {
        await updateCollectionShortcut(accessToken, editingShortcutId, payload);
      } else {
        await createCollectionShortcut(accessToken, payload);
      }

      await loadShortcuts();
      onShortcutsChanged();
      setMode("list");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (shortcutId: string) => {
    await deleteCollectionShortcut(accessToken, shortcutId);
    await loadShortcuts();
    onShortcutsChanged();
  };

  const sheetTitle = mode === "list" ? "Genveje" : "Ny genvej";
  const canSave = selectedClub !== null && !saving;

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
            {loading ? (
              <ActivityIndicator color={theme.fillPrimary} />
            ) : (
              <ScrollView>
                {shortcuts.map((shortcut) => (
                  <View key={shortcut.id} style={styles.manageRow}>
                    <IoniconsDragHandle color={theme.contentMuted} />
                    <View style={styles.manageMain}>
                      <Text style={[typography.body, { color: theme.contentPrimary }]}>
                        {shortcut.name}
                      </Text>
                      <Text style={[typography.mono, { color: theme.contentMuted }]}>
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
            <View style={styles.field}>
              <Text style={[typography.label, { color: theme.contentPrimary }]}>Klub</Text>
              <ListRow
                title={selectedClub?.label ?? "Vælg klub"}
                onPress={() => setClubPickerOpen(true)}
                selected={selectedClub !== null}
              />
            </View>

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

      <ClubPickerOverlay
        visible={visible && clubPickerOpen}
        accessToken={accessToken}
        selectedClubId={selectedClub?.id ?? null}
        onSelect={(club) => setSelectedClub(club)}
        onDismiss={() => setClubPickerOpen(false)}
      />
    </>
  );
}

function IoniconsDragHandle({ color }: { color: string }) {
  return (
    <View style={styles.dragHandle} accessibilityElementsHidden>
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
