import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import {
  closeCase,
  createCase,
  deleteCasePermanent,
  type CaseBoardRow,
  fetchActiveCases,
} from '../services/api';

function statusDotColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'dormant') return Colors.textSecondary;
  if (s === 'critical') return Colors.alert;
  return Colors.signalOnline;
}

function isTerminatedStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'closed' || s === 'terminated' || s === 'archived';
}

export default function CaseBoardScreen() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<CaseBoardRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchActiveCases();
    setCases(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedCases = useMemo(() => {
    const active: CaseBoardRow[] = [];
    const inactive: CaseBoardRow[] = [];
    for (const c of cases) {
      (isTerminatedStatus(String(c.status || '')) ? inactive : active).push(c);
    }
    return [...active, ...inactive];
  }, [cases]);

  const showEmpty = !loading && sortedCases.length === 0;

  const openCreate = useCallback(() => {
    setNewTitle('');
    setNewSummary('');
    setCreateOpen(true);
  }, []);

  const submitCreate = useCallback(async () => {
    const t = newTitle.trim();
    const s = newSummary.trim();
    if (!t || creating) return;
    setCreating(true);
    const row = await createCase({ title: t, summary: s });
    setCreating(false);
    if (!row) return;
    setCreateOpen(false);
    await load();
  }, [newTitle, newSummary, creating, load]);

  const confirmActions = useCallback(
    (row: CaseBoardRow) => {
      Alert.alert(row.case_id, undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'TERMINATE',
          style: 'destructive',
          onPress: async () => {
            await closeCase(row.case_id);
            await load();
          },
        },
        {
          text: 'DELETE',
          style: 'destructive',
          onPress: async () => {
            Alert.alert('This cannot be undone.', undefined, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'DELETE',
                style: 'destructive',
                onPress: async () => {
                  const ok = await deleteCasePermanent(row.case_id);
                  if (ok) {
                    setCases((prev) => prev.filter((c) => c.case_id !== row.case_id));
                  }
                  await load();
                },
              },
            ]);
          },
        },
      ]);
    },
    [load]
  );

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={openCreate}
              style={({ pressed }) => [
                styles.headerBtn,
                pressed && styles.headerBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open new case"
            >
              <Ionicons name="add" size={22} color={Colors.accent} />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loading ? (
          <View style={styles.loadingWrap} />
        ) : showEmpty ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No active cases.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sortedCases.map((c, i) => {
              const terminated = isTerminatedStatus(String(c.status || ''));
              return (
                <Pressable
                  key={`${c.case_id}-${i}`}
                  onPress={() =>
                    router.push({
                      pathname: './casedetail',
                      params: { case: encodeURIComponent(JSON.stringify(c)) },
                    })
                  }
                  onLongPress={() => confirmActions(c)}
                  style={styles.card}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${c.case_id}`}
                >
                  {terminated ? (
                    <View pointerEvents="none" style={styles.terminatedStampWrap}>
                      <Text style={styles.terminatedStamp}>TERMINATED</Text>
                    </View>
                  ) : null}
                  <View style={styles.cardTop}>
                    <Text style={styles.caseId} allowFontScaling={false}>
                      {c.case_id}
                    </Text>
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: statusDotColor(String(c.status || '')) },
                      ]}
                    />
                  </View>
                  <Text style={styles.title}>{c.title}</Text>
                  <Text style={styles.lastUpdate}>{c.last_update || '—'}</Text>
                  <Text
                    style={styles.summary}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {c.summary || '—'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              NEW CASE
            </Text>
            <TextInput
              style={styles.modalInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Case title"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              value={newSummary}
              onChangeText={setNewSummary}
              placeholder="Initial summary"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
              multiline
            />
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setCreateOpen(false)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  pressed && styles.modalBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalBtnText}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={() => void submitCreate()}
                disabled={creating || !newTitle.trim()}
                style={({ pressed }) => [
                  styles.modalBtnPrimary,
                  pressed && styles.modalBtnPressed,
                  (creating || !newTitle.trim()) && styles.modalBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open case"
              >
                <Text style={styles.modalBtnPrimaryText}>OPEN CASE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  caseId: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  lastUpdate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  terminatedStampWrap: {
    position: 'absolute',
    top: 18,
    left: -40,
    width: 220,
    alignItems: 'center',
    transform: [{ rotate: '-20deg' }],
    opacity: 0.85,
  },
  terminatedStamp: {
    fontSize: 16,
    color: Colors.alert,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  headerBtnPressed: {
    opacity: 0.65,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    backgroundColor: Colors.background,
    padding: 16,
  },
  modalTitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 12,
  },
  modalInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    backgroundColor: Colors.inputBackground,
    color: Colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  modalInputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalBtnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalBtnPressed: {
    opacity: 0.7,
  },
  modalBtnDisabled: {
    opacity: 0.35,
  },
  modalBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  modalBtnPrimaryText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
  },
});
