import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TechnicalIntelligenceFile } from '../components/TechnicalIntelligenceFile';
import { Colors } from '../constants/colors';
import {
  fetchFailsafeSubsystem,
  parseTechnicalFile,
  requestSubsystemAssessment,
  updateSubsystem,
  type FailsafeSubsystemDetail,
} from '../services/api';

const FS = Colors.alert;
const SUBTLE_MUTED = '#6b7280';

function clampTrl(n: number): number {
  const t = Math.round(Number(n));
  if (Number.isNaN(t)) return 1;
  return Math.max(1, Math.min(9, t));
}

function trlColor(trl: number): string {
  const t = clampTrl(trl);
  if (t <= 3) return FS;
  if (t <= 6) return Colors.accent;
  return Colors.signalOnline;
}

function formatTitle(raw: string): string {
  return String(raw || '')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase();
}

export default function FailsafeSubsystemScreen() {
  const params = useLocalSearchParams<{ subsystem_name?: string }>();
  const subsystemName = String(params.subsystem_name || '').trim();

  const [row, setRow] = useState<FailsafeSubsystemDetail | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [trl, setTrl] = useState('4');
  const [status, setStatus] = useState('');
  const [engineeringNotes, setEngineeringNotes] = useState('');
  const [nextMilestone, setNextMilestone] = useState('');
  const [uapAffected, setUapAffected] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!subsystemName) return;
    const r = await fetchFailsafeSubsystem(subsystemName);
    setRow(r);
    if (r) {
      setTrl(String(clampTrl(r.trl)));
      setStatus(String(r.status ?? ''));
      setEngineeringNotes(String(r.engineering_notes ?? ''));
      setNextMilestone(String(r.next_milestone ?? ''));
      setUapAffected(Boolean(r.uap_affected));
    }
  }, [subsystemName]);

  useEffect(() => {
    void load();
  }, [load]);

  const assessmentReady = Boolean(row?.bruce_assessment?.trim());

  useEffect(() => {
    if (assessmentReady || !subsystemName) return;
    const id = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(id);
  }, [assessmentReady, subsystemName, load]);

  const parsed = useMemo(() => {
    const raw = row?.bruce_assessment?.trim() ?? '';
    if (!raw) return {};
    const p = parseTechnicalFile(raw);
    const hasAnyContent = Object.values(p).some((v) => String(v ?? '').trim().length > 0);
    if (Object.keys(p).length === 0 || !hasAnyContent) {
      return { 'TECHNICAL OVERVIEW': raw };
    }
    return p;
  }, [row?.bruce_assessment]);

  const openEdit = useCallback(() => {
    if (!row) return;
    setTrl(String(clampTrl(row.trl)));
    setStatus(String(row.status ?? ''));
    setEngineeringNotes(String(row.engineering_notes ?? ''));
    setNextMilestone(String(row.next_milestone ?? ''));
    setUapAffected(Boolean(row.uap_affected));
    setEditOpen(true);
  }, [row]);

  const onRegenerate = useCallback(async () => {
    if (!subsystemName || regenerating) return;
    setRegenerating(true);
    try {
      const d = await requestSubsystemAssessment(subsystemName);
      if (d) setRow(d);
      await load();
    } finally {
      setRegenerating(false);
    }
  }, [subsystemName, regenerating, load]);

  const onSave = useCallback(async () => {
    if (!subsystemName || saving) return;
    setSaving(true);
    const t = clampTrl(Number(trl || 1));
    const next = await updateSubsystem(subsystemName, {
      trl: t,
      status: status.trim(),
      engineering_notes: engineeringNotes.trim(),
      next_milestone: nextMilestone.trim(),
      uap_affected: uapAffected,
    });
    setSaving(false);
    if (next) {
      setRow(next);
      setEditOpen(false);
    }
  }, [subsystemName, saving, trl, status, engineeringNotes, nextMilestone, uapAffected]);

  const title = row?.name ? formatTitle(row.name) : formatTitle(subsystemName);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: title || 'Subsystem',
          headerBackTitle: 'Failsafe',
          headerTintColor: FS,
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.nameHeader}>{title}</Text>

          <View style={styles.metaRow}>
            <View style={[styles.trlBadge, { borderColor: trlColor(row?.trl ?? 1) }]}>
              <Text style={[styles.trlBadgeText, { color: trlColor(row?.trl ?? 1) }]} allowFontScaling={false}>
                TRL {clampTrl(row?.trl ?? 1)}
              </Text>
            </View>
            <View style={[styles.stBadge, { borderColor: Colors.border }]}>
              <Text style={styles.stBadgeText} allowFontScaling={false}>
                {String(row?.status ?? '—').toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.label} allowFontScaling={false}>
            DESCRIPTION
          </Text>
          <Text style={styles.body}>{row?.description?.trim() || '—'}</Text>

          <Text style={styles.label} allowFontScaling={false}>
            ENGINEERING NOTES
          </Text>
          <Text style={styles.body}>{row?.engineering_notes?.trim() || '—'}</Text>

          <Text style={styles.label} allowFontScaling={false}>
            NEXT MILESTONE
          </Text>
          <Text style={styles.body}>{row?.next_milestone?.trim() || '—'}</Text>

          {row?.uap_affected ? (
            <Text style={styles.uapFlag} allowFontScaling={false}>
              ⚡ UAP DATA RELEVANT
            </Text>
          ) : null}

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            TECHNICAL FILE
          </Text>
          {!assessmentReady ? (
            <Text style={styles.generatingHint}>Generating technical file...</Text>
          ) : (
            <TechnicalIntelligenceFile parsed={parsed} />
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable
            onPress={openEdit}
            style={({ pressed }) => [styles.btn, styles.btnMuted, pressed && styles.pressed]}
          >
            <Text style={styles.btnTextMuted} allowFontScaling={false}>
              UPDATE
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => void onRegenerate()}
          disabled={regenerating}
          style={({ pressed }) => [styles.regenerateBtn, pressed && styles.pressed, regenerating && styles.disabled]}
        >
          <Text style={styles.regenerateText} allowFontScaling={false}>
            {regenerating ? 'Regenerating…' : 'Regenerate Technical File'}
          </Text>
        </Pressable>
      </SafeAreaView>

      <Modal
        visible={editOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              UPDATE SUBSYSTEM
            </Text>
            <TextInput
              style={styles.input}
              value={trl}
              onChangeText={setTrl}
              placeholder="TRL (1-9)"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
            />
            <TextInput
              style={styles.input}
              value={status}
              onChangeText={setStatus}
              placeholder="Status"
              placeholderTextColor={Colors.textSecondary}
            />
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={engineeringNotes}
              onChangeText={setEngineeringNotes}
              placeholder="Engineering notes"
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={nextMilestone}
              onChangeText={setNextMilestone}
              placeholder="Next milestone"
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <View style={styles.uapRow}>
              <Text style={styles.uapLabel}>UAP affected</Text>
              <Switch
                value={uapAffected}
                onValueChange={setUapAffected}
                trackColor={{ false: Colors.border, true: FS }}
                thumbColor={Colors.textPrimary}
              />
            </View>
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setEditOpen(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.btnTextMuted} allowFontScaling={false}>
                  CANCEL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void onSave()}
                disabled={saving}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed, saving && styles.disabled]}
              >
                <Text style={styles.modalBtnAccent} allowFontScaling={false}>
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
  disabled: { opacity: 0.45 },

  nameHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: FS,
    marginBottom: 12,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  trlBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  trlBadgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  stBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  stBadgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },

  label: {
    marginTop: 16,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  body: { marginTop: 6, fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  uapFlag: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
  },
  generatingHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    color: SUBTLE_MUTED,
    lineHeight: 22,
  },

  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: FS,
  },
  btn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: FS,
  },
  btnMuted: { borderColor: Colors.border },
  btnTextMuted: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },

  regenerateBtn: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    alignItems: 'center',
  },
  regenerateText: {
    fontSize: 12,
    color: SUBTLE_MUTED,
    textAlign: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    borderWidth: 1,
    borderColor: FS,
    backgroundColor: Colors.background,
    padding: 16,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
    marginBottom: 12,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
    color: Colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  uapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  uapLabel: { fontSize: 14, color: Colors.textPrimary },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  modalBtn: {
    height: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalBtnAccent: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: FS, fontWeight: '700' },
});
