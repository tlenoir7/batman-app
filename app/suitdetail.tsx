import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TechnicalIntelligenceFile } from '../components/TechnicalIntelligenceFile';
import { Colors } from '../constants/colors';
import {
  fetchSuitCapabilities,
  fetchSuitStatus,
  parseTechnicalFile,
  regenerateSuitTechnicalFile,
  updateSuitNotes,
  type SuitStatus,
} from '../services/api';

const SUBTLE_MUTED = '#6b7280';

function statusDot(status: string): string {
  const s = status.toLowerCase();
  if (s === 'critical') return Colors.alert;
  if (s === 'dormant') return Colors.textSecondary;
  return Colors.signalOnline;
}

export default function SuitDetailScreen() {
  const [suit, setSuit] = useState<SuitStatus | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    const [s, caps] = await Promise.all([fetchSuitStatus(), fetchSuitCapabilities()]);
    setSuit(s);
    setCapabilities(caps);
    setNotes(s?.notes ?? '');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const briefingReady = Boolean(suit?.bruce_briefing?.trim());

  useEffect(() => {
    if (briefingReady) return;
    const id = setInterval(() => {
      void (async () => {
        const s = await fetchSuitStatus();
        if (s) {
          setSuit(s);
          setNotes(s.notes ?? '');
        }
      })();
    }, 3000);
    return () => clearInterval(id);
  }, [briefingReady]);

  const parsed = useMemo(() => {
    const raw = suit?.bruce_briefing?.trim() ?? '';
    if (!raw) return {};
    const p = parseTechnicalFile(raw);
    const hasAnyContent = Object.values(p).some((v) => String(v ?? '').trim().length > 0);
    if (Object.keys(p).length === 0 || !hasAnyContent) {
      return { 'TECHNICAL OVERVIEW': raw };
    }
    return p;
  }, [suit?.bruce_briefing]);

  const onRegenerate = useCallback(async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const fresh = await regenerateSuitTechnicalFile();
      if (fresh) {
        setSuit(fresh);
        setNotes(fresh.notes ?? '');
      } else {
        const s = await fetchSuitStatus();
        if (s) {
          setSuit(s);
          setNotes(s.notes ?? '');
        }
      }
      const caps = await fetchSuitCapabilities();
      setCapabilities(caps);
    } catch (e) {
      console.warn('Suit regenerate failed', e);
    } finally {
      setRegenerating(false);
    }
  }, [regenerating]);

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
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel} allowFontScaling={false}>
              BATMAN BEYOND SUIT
            </Text>
            <View style={[styles.dot, { backgroundColor: statusDot(suit?.status ?? 'active') }]} />
          </View>

          <Text style={styles.priority}>{suit?.current_priority?.trim() || 'No priority set.'}</Text>

          {!briefingReady ? (
            <Text style={styles.generatingHint}>Generating technical file...</Text>
          ) : (
            <TechnicalIntelligenceFile parsed={parsed} capabilities={capabilities.length ? capabilities : undefined} />
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => setNotesOpen(true)}
            style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}
          >
            <Text style={styles.footerBtnMuted} allowFontScaling={false}>
              UPDATE NOTES
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void onRegenerate()}
            disabled={regenerating}
            style={({ pressed }) => [styles.regenerateBtn, pressed && styles.pressed, regenerating && styles.disabled]}
          >
            <Text style={styles.regenerateText} allowFontScaling={false}>
              {regenerating ? 'Regenerating…' : 'Regenerate Technical File'}
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
                <Text style={styles.footerBtnMuted} allowFontScaling={false}>
                  CANCEL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void onSaveNotes()}
                disabled={saving}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed, saving && styles.disabled]}
              >
                <Text style={styles.footerBtnAccentText} allowFontScaling={false}>
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
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLabel: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent },
  dot: { width: 6, height: 6, borderRadius: 3 },
  priority: { marginTop: 10, fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },

  generatingHint: {
    marginTop: 48,
    textAlign: 'center',
    fontSize: 14,
    color: SUBTLE_MUTED,
    lineHeight: 22,
  },

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: Colors.background,
  },
  footerBtn: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerBtnAccentText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },
  footerBtnMuted: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },

  regenerateBtn: {
    marginTop: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  regenerateText: {
    fontSize: 12,
    color: SUBTLE_MUTED,
    textAlign: 'center',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 18 },
  modalCard: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, padding: 16 },
  modalTitle: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, marginBottom: 12 },
  modalInput: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
    color: Colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  modalBtn: { height: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
});
