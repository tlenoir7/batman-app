import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import {
  activateContingency,
  deleteContingency,
  getContingency,
  requestContingencyAssessment,
  retireContingency,
  type ContingencyRow,
} from '../services/api';

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

function isFailsafeRow(c: ContingencyRow | null): boolean {
  return String(c?.classification || '').toUpperCase() === 'FAILSAFE';
}

export default function ContingencyDetailScreen() {
  const params = useLocalSearchParams<{ cont_id?: string }>();
  const contId = String(params.cont_id || '').trim();

  const [row, setRow] = useState<ContingencyRow | null>(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    if (!contId) return;
    const r = await getContingency(contId);
    setRow(r);
  }, [contId]);

  useEffect(() => {
    void load();
  }, [load]);

  const numberedSteps = useMemo(() => {
    const raw = String(row?.execution_steps || '').trim();
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [row?.execution_steps]);

  const onAssess = useCallback(async () => {
    if (!contId || assessing) return;
    setAssessing(true);
    try {
      const assessed = await requestContingencyAssessment(contId);
      if (assessed) setRow(assessed);
      const fresh = await getContingency(contId);
      if (fresh) setRow(fresh);
    } finally {
      setAssessing(false);
    }
  }, [contId, assessing]);

  const onActivate = useCallback(() => {
    if (!contId) return;
    Alert.alert('Activate', 'Activate this contingency?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'ACTIVATE',
        style: 'default',
        onPress: async () => {
          const ok = await activateContingency(contId);
          if (ok) void load();
        },
      },
    ]);
  }, [contId, load]);

  const onRetire = useCallback(async () => {
    if (!contId) return;
    const ok = await retireContingency(contId);
    if (ok) void load();
  }, [contId, load]);

  const onDelete = useCallback(() => {
    if (!contId || isFailsafeRow(row)) return;
    Alert.alert('DELETE', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'DELETE',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteContingency(contId);
          if (ok) router.back();
        },
      },
    ]);
  }, [contId, row]);

  const cls = String(row?.classification || 'STANDARD');
  const cs = classificationBadgeStyle(cls);
  const stColor = statusBadgeColor(String(row?.status || ''));

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: row?.title || 'Contingency' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.badgeRow}>
            <View style={[styles.clsBadge, { backgroundColor: cs.bg, borderColor: cs.border }]}>
              <Text style={[styles.clsBadgeText, { color: cs.fg }]} allowFontScaling={false}>
                {cls.toUpperCase()}
              </Text>
            </View>
            <View style={[styles.stBadge, { borderColor: stColor }]}>
              <Text style={[styles.stBadgeText, { color: stColor }]} allowFontScaling={false}>
                {String(row?.status || '—').toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={styles.label} allowFontScaling={false}>
            TRIGGER CONDITION
          </Text>
          <Text style={styles.value}>{row?.trigger_condition?.trim() || '—'}</Text>

          <Text style={styles.label} allowFontScaling={false}>
            OBJECTIVE
          </Text>
          <Text style={styles.value}>{row?.objective?.trim() || '—'}</Text>

          <Text style={styles.label} allowFontScaling={false}>
            EXECUTION STEPS
          </Text>
          {numberedSteps.length ? (
            numberedSteps.map((line, i) => (
              <Text key={`${i}-${line}`} style={styles.stepLine}>
                {i + 1}. {line}
              </Text>
            ))
          ) : (
            <Text style={styles.value}>—</Text>
          )}

          <Text style={[styles.label, { color: Colors.alert }]} allowFontScaling={false}>
            FAILSAFE WITHIN
          </Text>
          <Text style={styles.value}>{row?.failsafe_within?.trim() || '—'}</Text>

          <Text style={[styles.sectionLabel, { color: Colors.accent }]} allowFontScaling={false}>
            BRUCE'S ASSESSMENT
          </Text>
          <Text style={styles.assessment}>{row?.bruce_assessment?.trim() || '—'}</Text>
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable
            onPress={() => void onAssess()}
            disabled={assessing}
            style={({ pressed }) => [
              styles.btn,
              styles.btnAccent,
              pressed && styles.pressed,
              assessing && styles.disabled,
            ]}
          >
            <Text style={[styles.btnTextAccent, assessing && { color: Colors.textSecondary }]} allowFontScaling={false}>
              {assessing ? 'ANALYZING...' : 'REQUEST ASSESSMENT'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.bottomBar}>
          <Pressable
            onPress={onActivate}
            style={({ pressed }) => [styles.btn, styles.btnActivate, pressed && styles.pressed]}
          >
            <Text style={styles.btnTextActivate} allowFontScaling={false}>
              ACTIVATE
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void onRetire()}
            style={({ pressed }) => [styles.btn, styles.btnRetire, pressed && styles.pressed]}
          >
            <Text style={styles.btnTextRetire} allowFontScaling={false}>
              RETIRE
            </Text>
          </Pressable>
        </View>
        <View style={[styles.bottomBar, { paddingBottom: 14 }]}>
          <Pressable
            onPress={onDelete}
            disabled={isFailsafeRow(row)}
            style={({ pressed }) => [
              styles.btn,
              styles.btnDelete,
              pressed && styles.pressed,
              isFailsafeRow(row) && styles.disabled,
            ]}
          >
            <Text style={styles.btnTextDelete} allowFontScaling={false}>
              DELETE
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safe: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  clsBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  clsBadgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },
  stBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  stBadgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '700' },

  label: {
    marginTop: 12,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  value: { marginTop: 6, fontSize: 15, color: Colors.textPrimary, lineHeight: 24 },
  stepLine: { marginTop: 8, fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  sectionLabel: {
    marginTop: 18,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  assessment: {
    marginTop: 8,
    fontSize: 15,
    fontStyle: 'italic',
    color: Colors.textPrimary,
    lineHeight: 24,
  },

  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  btn: { flex: 1, height: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  btnAccent: { borderColor: Colors.accent },
  btnActivate: { borderColor: Colors.signalOnline, backgroundColor: 'transparent' },
  btnRetire: { borderColor: Colors.border },
  btnDelete: { borderColor: Colors.alert },
  btnTextAccent: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, fontWeight: '700' },
  btnTextActivate: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.signalOnline, fontWeight: '700' },
  btnTextRetire: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },
  btnTextDelete: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.alert, fontWeight: '700' },
});
