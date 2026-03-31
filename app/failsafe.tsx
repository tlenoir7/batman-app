import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
  fetchFailsafeProject,
  implementMemoryWipe,
  requestFailsafeAssessment,
  requestSubsystemAssessment,
  setFailsafeDirective,
  type FailsafeProject,
  type FailsafeSubsystemSummary,
} from '../services/api';

const FS = Colors.alert;

function clampTrl(n: number): number {
  const t = Math.round(Number(n));
  if (Number.isNaN(t)) return 1;
  return Math.max(1, Math.min(9, t));
}

function trlBadgeColor(trl: number): string {
  const t = clampTrl(trl);
  if (t <= 3) return FS;
  if (t <= 6) return Colors.accent;
  return Colors.signalOnline;
}

function formatSubsystemName(raw: string): string {
  return String(raw || '')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeSixTrls(fp: FailsafeProject | null): number[] {
  const fromArr = fp?.subsystem_trls;
  if (Array.isArray(fromArr) && fromArr.length > 0) {
    const out: number[] = [];
    for (let i = 0; i < 6; i++) out.push(clampTrl(fromArr[i] ?? 1));
    return out;
  }
  const subs = fp?.subsystems;
  if (Array.isArray(subs) && subs.length > 0) {
    const out: number[] = [];
    for (let i = 0; i < 6; i++) out.push(clampTrl(subs[i]?.trl ?? 1));
    return out;
  }
  return [1, 1, 1, 1, 1, 1];
}

const DEFAULT_SUBSYSTEM_KEYS = [
  'autonomous_decision_engine',
  'physical_chassis',
  'sensor_suite',
  'communications_mesh',
  'power_core',
  'uap_interface',
] as const;

function buildSubsystemRows(fp: FailsafeProject | null): FailsafeSubsystemSummary[] {
  const subs = fp?.subsystems;
  if (Array.isArray(subs) && subs.length > 0) {
    return subs.slice(0, 6).map((s) => ({
      name: s.name,
      display_name: s.display_name,
      trl: clampTrl(s.trl),
      status: String(s.status ?? '—'),
      next_milestone: s.next_milestone,
    }));
  }
  const trls = normalizeSixTrls(fp);
  return DEFAULT_SUBSYSTEM_KEYS.map((name, i) => ({
    name,
    trl: trls[i] ?? 1,
    status: '—',
    next_milestone: '',
  }));
}

export default function FailsafeScreen() {
  const [project, setProject] = useState<FailsafeProject | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [subAssessing, setSubAssessing] = useState<string | null>(null);

  const [directiveOpen, setDirectiveOpen] = useState(false);
  const [directiveDraft, setDirectiveDraft] = useState('');
  const [savingDirective, setSavingDirective] = useState(false);

  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0);
  const [wipeBusy, setWipeBusy] = useState(false);

  const load = useCallback(async () => {
    const p = await fetchFailsafeProject();
    setProject(p);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subsystemRows = useMemo(() => buildSubsystemRows(project), [project]);

  const onProjectAssess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const next = await requestFailsafeAssessment();
      if (next) setProject(next);
      const fresh = await fetchFailsafeProject();
      if (fresh) setProject(fresh);
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const onSubsystemAssess = useCallback(
    async (name: string) => {
      const n = String(name || '').trim();
      if (!n || subAssessing) return;
      setSubAssessing(n);
      try {
        const d = await requestSubsystemAssessment(n);
        if (d) await load();
      } finally {
        setSubAssessing(null);
      }
    },
    [subAssessing, load]
  );

  const openDirective = useCallback(() => {
    setDirectiveDraft(project?.directive?.trim() ?? '');
    setDirectiveOpen(true);
  }, [project?.directive]);

  const saveDirective = useCallback(async () => {
    if (savingDirective) return;
    setSavingDirective(true);
    const next = await setFailsafeDirective(directiveDraft.trim());
    setSavingDirective(false);
    if (next) {
      setProject(next);
      setDirectiveOpen(false);
      await load();
    }
  }, [directiveDraft, savingDirective, load]);

  const wipeWarningText =
    project?.memory_wipe_warning?.trim() ||
    'Proceeding will implement the memory wipe protocol. This action is irreversible. Bruce advises extreme caution.';

  const runWipe = useCallback(async () => {
    if (wipeBusy) return;
    setWipeBusy(true);
    const next = await implementMemoryWipe();
    setWipeBusy(false);
    setWipeStep(0);
    if (next) setProject(next);
    await load();
  }, [wipeBusy, load]);

  const directiveSet = Boolean(project?.directive?.trim());

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'Failsafe',
          headerBackTitle: 'Arsenal',
          headerTintColor: FS,
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.topLabel} allowFontScaling={false}>
            FAILSAFE PROJECT
          </Text>
          <View style={styles.rowBetween}>
            <View style={[styles.badge, { borderColor: FS }]}>
              <Text style={[styles.badgeText, { color: FS }]} allowFontScaling={false}>
                {String(project?.project_status ?? 'UNKNOWN').toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            DIRECTIVE
          </Text>
          {directiveSet ? (
            <Text style={styles.directiveBody}>{project?.directive?.trim()}</Text>
          ) : (
            <Text style={styles.directivePlaceholder}>Directive not yet defined.</Text>
          )}
          {!directiveSet ? (
            <Pressable
              onPress={openDirective}
              style={({ pressed }) => [styles.setDirectiveBtn, pressed && styles.pressed]}
            >
              <Text style={styles.setDirectiveText} allowFontScaling={false}>
                SET DIRECTIVE
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            MEMORY WIPE PROTOCOL
          </Text>
          {project?.memory_wipe_implemented ? (
            <Text style={styles.wipeImplemented} allowFontScaling={false}>
              IMPLEMENTED
            </Text>
          ) : (
            <>
              <Text style={styles.wipePending} allowFontScaling={false}>
                PENDING
              </Text>
              <Pressable
                onPress={() => setWipeStep(1)}
                style={({ pressed }) => [styles.implementBtn, pressed && styles.pressed]}
              >
                <Text style={styles.implementBtnText} allowFontScaling={false}>
                  IMPLEMENT
                </Text>
              </Pressable>
            </>
          )}

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            BRUCE'S ASSESSMENT
          </Text>
          <Text style={styles.assessment}>{project?.bruce_assessment?.trim() || '—'}</Text>

          {project?.uap_connection_notes?.trim() ? (
            <>
              <Text style={styles.uapLabel} allowFontScaling={false}>
                UAP CONNECTION NOTES
              </Text>
              <Text style={styles.uapNotes}>{project.uap_connection_notes.trim()}</Text>
            </>
          ) : null}

          <Pressable
            onPress={() => void onProjectAssess()}
            disabled={assessing}
            style={({ pressed }) => [
              styles.assessBtn,
              pressed && styles.pressed,
              assessing && styles.disabled,
            ]}
          >
            <Text style={[styles.assessBtnText, assessing && { color: Colors.textSecondary }]} allowFontScaling={false}>
              {assessing ? 'ANALYZING...' : 'REQUEST ASSESSMENT'}
            </Text>
          </Pressable>

          <Text style={[styles.subsystemsHeader, { marginTop: 24 }]} allowFontScaling={false}>
            SUBSYSTEMS
          </Text>

          {subsystemRows.map((s) => (
            <View key={s.name} style={styles.subCard}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: './failsafesubsystem',
                    params: { subsystem_name: s.name },
                  })
                }
                style={({ pressed }) => [styles.subCardMain, pressed && styles.pressed]}
              >
                <Text style={styles.subName}>
                  {s.display_name?.trim() ? s.display_name.trim().toUpperCase() : formatSubsystemName(s.name)}
                </Text>
                <View style={styles.subMetaRow}>
                  <View style={[styles.trlBadge, { borderColor: trlBadgeColor(s.trl) }]}>
                    <Text style={[styles.trlBadgeText, { color: trlBadgeColor(s.trl) }]} allowFontScaling={false}>
                      TRL {clampTrl(s.trl)}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { borderColor: Colors.border }]}>
                    <Text style={styles.statusBadgeText} allowFontScaling={false}>
                      {String(s.status).toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.nextMilestone} numberOfLines={1}>
                  {s.next_milestone?.trim() || '—'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void onSubsystemAssess(s.name)}
                disabled={subAssessing === s.name}
                style={({ pressed }) => [
                  styles.subAssessBtn,
                  pressed && styles.pressed,
                  subAssessing === s.name && styles.disabled,
                ]}
              >
                <Text style={styles.subAssessText} allowFontScaling={false}>
                  {subAssessing === s.name ? 'ANALYZING...' : 'REQUEST ASSESSMENT'}
                </Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={directiveOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDirectiveOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              SET DIRECTIVE
            </Text>
            <TextInput
              style={styles.modalInput}
              value={directiveDraft}
              onChangeText={setDirectiveDraft}
              placeholder="Directive"
              placeholderTextColor={Colors.textSecondary}
              multiline
              editable={!savingDirective}
            />
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setDirectiveOpen(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalBtnMuted} allowFontScaling={false}>
                  CANCEL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void saveDirective()}
                disabled={savingDirective}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed, savingDirective && styles.disabled]}
              >
                <Text style={styles.modalBtnAccent} allowFontScaling={false}>
                  SAVE
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={wipeStep === 1}
        transparent
        animationType="fade"
        onRequestClose={() => setWipeStep(0)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              WARNING
            </Text>
            <Text style={styles.warningBody}>{wipeWarningText}</Text>
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setWipeStep(0)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalBtnMuted} allowFontScaling={false}>
                  CANCEL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWipeStep(2)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalBtnAccent} allowFontScaling={false}>
                  CONTINUE
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={wipeStep === 2}
        transparent
        animationType="fade"
        onRequestClose={() => setWipeStep(0)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              CONFIRM
            </Text>
            <Text style={styles.warningBody}>
              Confirm implementation of the memory wipe protocol? This cannot be undone.
            </Text>
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setWipeStep(0)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalBtnMuted} allowFontScaling={false}>
                  CANCEL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void runWipe()}
                disabled={wipeBusy}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed, wipeBusy && styles.disabled]}
              >
                <Text style={[styles.modalBtnAccent, { color: FS }]} allowFontScaling={false}>
                  {wipeBusy ? '…' : 'CONFIRM'}
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
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },

  topLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
    marginBottom: 10,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8 },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },

  sectionLabel: {
    marginTop: 18,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
  },
  directiveBody: {
    marginTop: 8,
    fontSize: 15,
    fontStyle: 'italic',
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  directivePlaceholder: {
    marginTop: 8,
    fontSize: 15,
    fontStyle: 'italic',
    color: Colors.textSecondary,
  },
  setDirectiveBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: FS,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  setDirectiveText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
    fontWeight: '700',
  },

  wipePending: { marginTop: 8, fontSize: 14, color: Colors.textSecondary },
  wipeImplemented: { marginTop: 8, fontSize: 14, color: FS, fontWeight: '700' },
  implementBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: FS,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  implementBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
    fontWeight: '700',
  },

  assessment: {
    marginTop: 8,
    fontSize: 15,
    fontStyle: 'italic',
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  uapLabel: {
    marginTop: 18,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  uapNotes: {
    marginTop: 8,
    fontSize: 14,
    fontStyle: 'italic',
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  assessBtn: {
    marginTop: 18,
    height: 44,
    borderWidth: 1,
    borderColor: FS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assessBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
    fontWeight: '700',
  },

  subsystemsHeader: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  subCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: FS,
  },
  subCardMain: { padding: 14 },
  subName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  subMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' },
  trlBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  trlBadgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  statusBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },
  nextMilestone: { marginTop: 10, fontSize: 14, color: Colors.textSecondary },
  subAssessBtn: {
    borderTopWidth: 1,
    borderTopColor: FS,
    paddingVertical: 12,
    alignItems: 'center',
  },
  subAssessText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
    fontWeight: '700',
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
  },
  modalTitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS,
    marginBottom: 12,
  },
  modalInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
    color: Colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  warningBody: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  modalBtn: {
    height: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalBtnMuted: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },
  modalBtnAccent: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: FS, fontWeight: '700' },
});
