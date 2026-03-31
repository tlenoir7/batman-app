import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { fetchSuitStatus, requestSuitAssessment, updateSuitNotes, type SuitStatus } from '../services/api';

function statusDot(status: string): string {
  const s = status.toLowerCase();
  if (s === 'critical') return Colors.alert;
  if (s === 'dormant') return Colors.textSecondary;
  return Colors.signalOnline;
}

export default function SuitDetailScreen() {
  const [suit, setSuit] = useState<SuitStatus | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const s = await fetchSuitStatus();
    setSuit(s);
    setNotes(s?.notes ?? '');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trlSystems = useMemo(() => {
    const m = suit?.trl_systems ?? {};
    return Object.keys(m)
      .sort()
      .map((k) => ({ name: k, trl: m[k] ?? 0 }));
  }, [suit]);

  const onAssess = useCallback(async () => {
    const s = await requestSuitAssessment();
    if (s) {
      setSuit(s);
      setNotes(s.notes ?? '');
    }
  }, []);

  const onSaveNotes = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const ok = await updateSuitNotes(notes);
    setSaving(false);
    if (ok) {
      setNotesOpen(false);
      await load();
    }
  }, [notes, saving, load]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Suit' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel} allowFontScaling={false}>
              BATMAN BEYOND SUIT
            </Text>
            <View style={[styles.dot, { backgroundColor: statusDot(suit?.status ?? 'active') }]} />
          </View>

          <Text style={styles.priority}>{suit?.current_priority?.trim() || 'No priority set.'}</Text>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            BRUCE'S ENGINEERING BRIEF
          </Text>
          <Text style={styles.brief}>{suit?.bruce_briefing?.trim() || '—'}</Text>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            TRL BREAKDOWN
          </Text>
          {trlSystems.length ? (
            trlSystems.map((r) => (
              <View key={r.name} style={styles.trlRow}>
                <View style={styles.trlRowTop}>
                  <Text style={styles.trlName}>{r.name.toUpperCase()}</Text>
                  <Text style={styles.trlValue}>{Math.max(0, Math.min(9, r.trl))}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(Math.max(0, Math.min(9, r.trl)) / 9) * 100}%` }]} />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No systems.</Text>
          )}

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            PRIORITIES
          </Text>
          {suit?.priorities?.length ? (
            suit.priorities.map((p, i) => (
              <Text key={`${p}-${i}`} style={styles.bullet}>
                • {p}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>—</Text>
          )}

          <Text style={[styles.sectionLabel, { color: Colors.alert }]} allowFontScaling={false}>
            BLOCKERS
          </Text>
          {suit?.blockers?.length ? (
            suit.blockers.map((b, i) => (
              <Text key={`${b}-${i}`} style={styles.blocker}>
                ⚠ {b}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>—</Text>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable
            onPress={onAssess}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Request assessment"
          >
            <Text style={styles.btnTextAccent} allowFontScaling={false}>
              REQUEST ASSESSMENT
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setNotesOpen(true)}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Update notes"
          >
            <Text style={styles.btnTextMuted} allowFontScaling={false}>
              UPDATE NOTES
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <Modal
        visible={notesOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotesOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              UPDATE NOTES
            </Text>
            <TextInput
              style={styles.modalInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes"
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setNotesOpen(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.btnTextMuted} allowFontScaling={false}>
                  CANCEL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void onSaveNotes()}
                disabled={saving}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed, saving && styles.disabled]}
              >
                <Text style={styles.btnTextAccent} allowFontScaling={false}>
                  SAVE
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent },
  dot: { width: 6, height: 6, borderRadius: 3 },
  priority: { marginTop: 10, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  sectionLabel: { marginTop: 18, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },
  brief: { marginTop: 8, fontSize: 15, fontStyle: 'italic', color: Colors.textPrimary, lineHeight: 24 },
  muted: { marginTop: 8, fontSize: 14, color: Colors.textSecondary },

  trlRow: { marginTop: 12, borderWidth: 1, borderColor: Colors.border, padding: 12 },
  trlRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trlName: { fontSize: 12, color: Colors.textSecondary },
  trlValue: { fontSize: 12, color: Colors.textPrimary, fontWeight: '700' },
  barTrack: { height: 6, backgroundColor: Colors.border, marginTop: 10 },
  barFill: { height: 6, backgroundColor: Colors.accent },

  bullet: { marginTop: 8, fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  blocker: { marginTop: 8, fontSize: 14, color: Colors.alert, lineHeight: 22 },

  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  btn: { flex: 1, height: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  btnTextAccent: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, fontWeight: '700' },
  btnTextMuted: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 18 },
  modalCard: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, padding: 16 },
  modalTitle: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, marginBottom: 12 },
  modalInput: { minHeight: 160, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.inputBackground, color: Colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  modalBtn: { height: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
});

