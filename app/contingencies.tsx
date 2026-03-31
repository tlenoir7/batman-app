import { Ionicons } from '@expo/vector-icons';
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
  createContingency,
  fetchContingencies,
  proposeContingencies,
  type ContingencyClassification,
  type ContingencyProposal,
  type ContingencyRow,
} from '../services/api';

const CLASS_OPTIONS: ContingencyClassification[] = ['STANDARD', 'ADVANCED', 'THEORETICAL'];

function isFailsafe(c: ContingencyRow): boolean {
  return String(c.classification || '').toUpperCase() === 'FAILSAFE';
}

function classificationBadgeStyle(cls: string): { bg: string; fg: string; border: string } {
  const u = cls.toUpperCase();
  if (u === 'ADVANCED') return { bg: Colors.accent, fg: Colors.textPrimary, border: Colors.accent };
  if (u === 'THEORETICAL') return { bg: '#1f2937', fg: Colors.textSecondary, border: '#1f2937' };
  return { bg: 'transparent', fg: Colors.textSecondary, border: Colors.textSecondary };
}

function statusBadgeColor(status: string): string {
  const u = status.toUpperCase();
  if (u === 'STAGED') return Colors.accent;
  if (u === 'READY') return Colors.signalOnline;
  if (u === 'ACTIVATED') return Colors.alert;
  if (u === 'RETIRED') return '#1f2937';
  return Colors.textSecondary;
}

export default function ContingenciesScreen() {
  const [rows, setRows] = useState<ContingencyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [classification, setClassification] = useState<ContingencyClassification>('STANDARD');
  const [trigger, setTrigger] = useState('');
  const [objective, setObjective] = useState('');
  const [executionSteps, setExecutionSteps] = useState('');
  const [failsafeWithin, setFailsafeWithin] = useState('');
  const [creating, setCreating] = useState(false);

  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeSituation, setProposeSituation] = useState('');
  const [proposeResults, setProposeResults] = useState<ContingencyProposal[] | null>(null);
  const [proposing, setProposing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchContingencies();
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { failsafe, standard } = useMemo(() => {
    const fs = rows.filter(isFailsafe);
    const rest = rows.filter((r) => !isFailsafe(r));
    return { failsafe: fs[0] ?? null, standard: rest };
  }, [rows]);

  const openCreate = useCallback(() => {
    setTitle('');
    setClassification('STANDARD');
    setTrigger('');
    setObjective('');
    setExecutionSteps('');
    setFailsafeWithin('');
    setCreateOpen(true);
  }, []);

  const submitCreate = useCallback(async () => {
    const t = title.trim();
    if (!t || creating) return;
    setCreating(true);
    const row = await createContingency({
      title: t,
      classification,
      trigger_condition: trigger.trim(),
      objective: objective.trim(),
      execution_steps: executionSteps.trim(),
      failsafe_within: failsafeWithin.trim(),
    });
    setCreating(false);
    if (!row) return;
    setCreateOpen(false);
    await load();
  }, [title, classification, trigger, objective, executionSteps, failsafeWithin, creating, load]);

  const openPropose = useCallback(() => {
    setProposeSituation('');
    setProposeResults(null);
    setProposeOpen(true);
  }, []);

  const runPropose = useCallback(async () => {
    if (proposing) return;
    setProposing(true);
    const list = await proposeContingencies(proposeSituation.trim());
    setProposeResults(list);
    setProposing(false);
  }, [proposeSituation, proposing]);

  const addProposal = useCallback(
    async (p: ContingencyProposal) => {
      const row = await createContingency({
        title: String(p.title || '').trim() || 'Untitled',
        classification: p.classification || 'STANDARD',
        trigger_condition: String(p.trigger_condition ?? ''),
        objective: String(p.objective ?? ''),
        execution_steps: String(p.execution_steps ?? ''),
        failsafe_within: String(p.failsafe_within ?? ''),
      });
      if (row) {
        setProposeOpen(false);
        setProposeResults(null);
        await load();
      }
    },
    [load]
  );

  const goDetail = useCallback((id: string) => {
    router.push({ pathname: './contingencydetail', params: { cont_id: id } });
  }, []);

  const renderCard = (c: ContingencyRow, opts: { failsafe?: boolean }) => {
    const cls = String(c.classification || 'STANDARD');
    const cs = classificationBadgeStyle(cls);
    const stColor = statusBadgeColor(String(c.status || ''));
    return (
      <Pressable
        key={c.cont_id}
        onPress={() => goDetail(c.cont_id)}
        style={({ pressed }) => [
          opts.failsafe ? styles.failsafeCard : styles.card,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={c.title}
      >
        {opts.failsafe ? (
          <Text style={styles.failsafeLabel} allowFontScaling={false}>
            FAILSAFE
          </Text>
        ) : null}
        <View style={styles.badgeRow}>
          <View style={[styles.clsBadge, { backgroundColor: cs.bg, borderColor: cs.border }]}>
            <Text style={[styles.clsBadgeText, { color: cs.fg }]} allowFontScaling={false}>
              {cls.toUpperCase()}
            </Text>
          </View>
          <View style={[styles.stBadge, { borderColor: stColor }]}>
            <Text style={[styles.stBadgeText, { color: stColor }]} allowFontScaling={false}>
              {String(c.status || '—').toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{c.title}</Text>
        <Text style={styles.trigger} numberOfLines={1}>
          {c.trigger_condition?.trim() || '—'}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'Contingencies',
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable
                onPress={openPropose}
                style={({ pressed }) => [styles.headerTextBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Propose contingencies"
              >
                <Text style={styles.headerProposeText} allowFontScaling={false}>
                  PROPOSE
                </Text>
              </Pressable>
              <Pressable
                onPress={openCreate}
                style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Create contingency"
              >
                <Ionicons name="add" size={22} color={Colors.accent} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loading ? null : null}
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {failsafe ? renderCard(failsafe, { failsafe: true }) : null}

          {standard.map((c) => renderCard(c, { failsafe: false }))}

          {!loading && !failsafe && standard.length === 0 ? (
            <Text style={styles.empty}>No contingencies.</Text>
          ) : null}
        </ScrollView>
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
              NEW CONTINGENCY
            </Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
            />
            <Text style={styles.fieldLabel} allowFontScaling={false}>
              CLASSIFICATION
            </Text>
            <View style={styles.pickerRow}>
              {CLASS_OPTIONS.map((opt) => {
                const on = classification === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setClassification(opt)}
                    style={[
                      styles.pill,
                      on && styles.pillOn,
                    ]}
                  >
                    <Text style={[styles.pillText, on && styles.pillTextOn]} allowFontScaling={false}>
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={styles.input}
              value={trigger}
              onChangeText={setTrigger}
              placeholder="Trigger condition"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
            />
            <TextInput
              style={styles.input}
              value={objective}
              onChangeText={setObjective}
              placeholder="Objective"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
            />
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={executionSteps}
              onChangeText={setExecutionSteps}
              placeholder="Execution steps"
              placeholderTextColor={Colors.textSecondary}
              multiline
              editable={!creating}
            />
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={failsafeWithin}
              onChangeText={setFailsafeWithin}
              placeholder="Failsafe within"
              placeholderTextColor={Colors.textSecondary}
              multiline
              editable={!creating}
            />
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setCreateOpen(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.btnMuted} allowFontScaling={false}>
                  CANCEL
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void submitCreate()}
                disabled={creating || !title.trim()}
                style={({ pressed }) => [
                  styles.modalBtn,
                  pressed && styles.pressed,
                  (creating || !title.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.btnAccent} allowFontScaling={false}>
                  CREATE
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={proposeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setProposeOpen(false);
          setProposeResults(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {proposeResults == null ? (
              <>
                <Text style={styles.modalTitle} allowFontScaling={false}>
                  DESCRIBE SITUATION
                </Text>
                <TextInput
                  style={[styles.input, styles.inputMulti, { minHeight: 120 }]}
                  value={proposeSituation}
                  onChangeText={setProposeSituation}
                  placeholder="Describe a situation…"
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  editable={!proposing}
                />
                <View style={styles.modalBtns}>
                  <Pressable
                    onPress={() => {
                      setProposeOpen(false);
                      setProposeResults(null);
                    }}
                    style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.btnMuted} allowFontScaling={false}>
                      CANCEL
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void runPropose()}
                    disabled={proposing}
                    style={({ pressed }) => [
                      styles.modalBtn,
                      pressed && styles.pressed,
                      proposing && styles.disabled,
                    ]}
                  >
                    <Text style={styles.btnAccent} allowFontScaling={false}>
                      {proposing ? '…' : 'PROPOSE'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle} allowFontScaling={false}>
                  PROPOSED CONTINGENCIES
                </Text>
                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  {proposeResults.length ? (
                    proposeResults.map((p, i) => (
                      <Pressable
                        key={`${p.title}-${i}`}
                        onPress={() => void addProposal(p)}
                        style={({ pressed }) => [styles.proposalRow, pressed && styles.pressed]}
                      >
                        <Text style={styles.cardTitle}>{p.title}</Text>
                        <Text style={styles.trigger} numberOfLines={2}>
                          {p.trigger_condition || p.objective || '—'}
                        </Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={styles.empty}>No proposals.</Text>
                  )}
                </ScrollView>
                <Pressable
                  onPress={() => setProposeResults(null)}
                  style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed, { alignSelf: 'flex-start' }]}
                >
                  <Text style={styles.btnMuted} allowFontScaling={false}>
                    BACK
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setProposeOpen(false);
                    setProposeResults(null);
                  }}
                  style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed, { marginTop: 8 }]}
                >
                  <Text style={styles.btnMuted} allowFontScaling={false}>
                    CLOSE
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerTextBtn: {
    height: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  headerProposeText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },

  failsafeCard: {
    borderWidth: 1,
    borderColor: Colors.alert,
    padding: 16,
    marginBottom: 16,
  },
  failsafeLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.alert,
    marginBottom: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 14,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  clsBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clsBadgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  stBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stBadgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  cardTitle: { marginTop: 10, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  trigger: { marginTop: 6, fontSize: 14, color: Colors.textSecondary },
  empty: { textAlign: 'center', color: Colors.textSecondary, fontSize: 14, marginTop: 24 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: 16,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pillOn: { borderColor: Colors.accent, backgroundColor: Colors.inputBackground },
  pillText: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: Colors.textSecondary },
  pillTextOn: { color: Colors.accent, fontWeight: '700' },
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
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  modalBtn: {
    height: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnMuted: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },
  btnAccent: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, fontWeight: '700' },
  proposalRow: { borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
});
