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
  createGadget,
  fetchFailsafeProject,
  fetchGadgets,
  fetchSuitStatus,
  suggestGadgets,
  type FailsafeProject,
  type GadgetRow,
  type GadgetStatus,
  type GadgetSuggestion,
  type SuitStatus,
} from '../services/api';

function suitStatusDot(status: string): string {
  const s = status.toLowerCase();
  if (s === 'critical') return Colors.alert;
  if (s === 'dormant') return Colors.textSecondary;
  return Colors.signalOnline;
}

function gadgetBadgeColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'field_ready') return Colors.signalOnline;
  if (s === 'in_development') return Colors.accent;
  if (s === 'retired') return Colors.alert;
  return Colors.textSecondary; // concept
}

const FS_RED = Colors.alert;

function clampTrl(n: number): number {
  const t = Math.round(Number(n));
  if (Number.isNaN(t)) return 1;
  return Math.max(1, Math.min(9, t));
}

function trlDotColor(trl: number): string {
  const t = clampTrl(trl);
  if (t <= 3) return FS_RED;
  if (t <= 6) return Colors.accent;
  return Colors.signalOnline;
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

export default function ArsenalScreen() {
  const [suit, setSuit] = useState<SuitStatus | null>(null);
  const [failsafe, setFailsafe] = useState<FailsafeProject | null>(null);
  const [gadgets, setGadgets] = useState<GadgetRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GadgetSuggestion[]>([]);

  const [name, setName] = useState('');
  const [status, setStatus] = useState<GadgetStatus>('concept');
  const [trl, setTrl] = useState('4');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, g, f] = await Promise.all([
      fetchSuitStatus(),
      fetchGadgets(),
      fetchFailsafeProject(),
    ]);
    setSuit(s);
    setGadgets(g);
    setFailsafe(f);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setName('');
    setStatus('concept');
    setTrl('4');
    setDesc('');
    setCreateOpen(true);
  }, []);

  const openSuggest = useCallback(async () => {
    const rows = await suggestGadgets('Mission context: unknown');
    setSuggestions(rows);
    setSuggestOpen(true);
  }, []);

  const submitCreate = useCallback(async () => {
    const n = name.trim();
    const d = desc.trim();
    const t = Math.max(1, Math.min(9, Number(trl || 1)));
    if (!n || creating) return;
    setCreating(true);
    const row = await createGadget({ name: n, status, trl: t, description: d });
    setCreating(false);
    if (!row) return;
    setCreateOpen(false);
    await load();
  }, [name, desc, trl, status, creating, load]);

  const addSuggestion = useCallback(
    async (s: GadgetSuggestion) => {
      const row = await createGadget({
        name: s.name,
        status: s.status,
        trl: s.trl,
        description: s.description,
      });
      if (row) {
        setSuggestOpen(false);
        await load();
      }
    },
    [load]
  );

  const trlTags = useMemo(() => {
    const m = suit?.trl_systems ?? {};
    const keys = Object.keys(m);
    return keys
      .sort()
      .slice(0, 6)
      .map((k) => ({ k, v: m[k]! }));
  }, [suit]);

  const failsafeDots = useMemo(() => normalizeSixTrls(failsafe), [failsafe]);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: 'Arsenal',
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => void openSuggest()}
                style={({ pressed }) => [
                  styles.headerBtn,
                  pressed && styles.headerBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Suggest gadgets"
              >
                <Text style={styles.headerBtnText}>SUGGEST</Text>
              </Pressable>
              <Pressable
                onPress={openCreate}
                style={({ pressed }) => [
                  styles.headerIconBtn,
                  pressed && styles.headerBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create gadget"
              >
                <Ionicons name="add" size={22} color={Colors.accent} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loading ? <View style={styles.loading} /> : null}
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => router.push('./failsafe')}
            style={({ pressed }) => [styles.failsafeCard, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open Failsafe project"
          >
            <View style={styles.failsafeTop}>
              <Text style={styles.failsafeHeaderLabel} allowFontScaling={false}>
                FAILSAFE
              </Text>
              <View style={[styles.fsStatusBadge, { borderColor: FS_RED }]}>
                <Text style={[styles.fsStatusBadgeText, { color: FS_RED }]} allowFontScaling={false}>
                  {String(failsafe?.project_status ?? 'UNKNOWN').toUpperCase()}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.failsafeDirective,
                !failsafe?.directive?.trim() && styles.failsafeDirectivePlaceholder,
              ]}
              numberOfLines={1}
            >
              {failsafe?.directive?.trim()
                ? failsafe.directive.trim()
                : 'Directive not yet defined.'}
            </Text>
            <Text
              style={
                failsafe?.memory_wipe_implemented
                  ? styles.memWipeImplemented
                  : styles.memWipePending
              }
              allowFontScaling={false}
            >
              {failsafe?.memory_wipe_implemented
                ? 'MEMORY WIPE: IMPLEMENTED'
                : 'MEMORY WIPE: PENDING'}
            </Text>
            <View style={styles.dotRow}>
              {failsafeDots.map((t, i) => (
                <View
                  key={`fs-dot-${i}`}
                  style={[styles.trlDot, { backgroundColor: trlDotColor(t) }]}
                />
              ))}
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('./suitdetail')}
            style={({ pressed }) => [styles.suitCard, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open suit detail"
          >
            <View style={styles.suitTop}>
              <Text style={styles.suitLabel} allowFontScaling={false}>
                BATMAN BEYOND SUIT
              </Text>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: suitStatusDot(suit?.status ?? 'active') },
                ]}
              />
            </View>
            <Text style={styles.suitPriority}>
              {suit?.current_priority?.trim() || 'No priority set.'}
            </Text>
            <View style={styles.tagRow}>
              {trlTags.length ? (
                trlTags.map((t) => (
                  <View key={t.k} style={styles.tag}>
                    <Text style={styles.tagText}>
                      {t.k.toUpperCase()}: {t.v}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>ARMOR: 4</Text>
                </View>
              )}
            </View>
          </Pressable>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            GADGETS
          </Text>

          {gadgets.map((g) => (
            <Pressable
              key={g.gadget_id}
              onPress={() =>
                router.push({
                  pathname: './gadgetdetail',
                  params: { gadget_id: g.gadget_id },
                })
              }
              onLongPress={() => {
                Alert.alert('DELETE', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'DELETE',
                    style: 'destructive',
                    onPress: async () => {
                      // handled in detail screen; list endpoint may not exist yet
                    },
                  },
                ]);
              }}
              style={({ pressed }) => [styles.gadgetCard, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${g.name}`}
            >
              <View style={styles.gadgetTop}>
                <Text style={styles.gadgetName}>{g.name}</Text>
                <View
                  style={[
                    styles.badge,
                    { borderColor: gadgetBadgeColor(String(g.status)) },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: gadgetBadgeColor(String(g.status)) },
                    ]}
                    allowFontScaling={false}
                  >
                    {String(g.status).toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.trl}>TRL {g.trl}</Text>
              <Text style={styles.desc} numberOfLines={1}>
                {g.description || '—'}
              </Text>
            </Pressable>
          ))}
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
              NEW GADGET
            </Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
            />
            <TextInput
              style={styles.modalInput}
              value={String(status)}
              onChangeText={(t) => setStatus((t.trim() || 'concept') as GadgetStatus)}
              placeholder="Status (concept | in_development | field_ready | retired)"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.modalInput}
              value={trl}
              onChangeText={setTrl}
              placeholder="TRL (1-9)"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              value={desc}
              onChangeText={setDesc}
              placeholder="Description"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
              multiline
            />
            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setCreateOpen(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalBtnMuted}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={() => void submitCreate()}
                disabled={creating || !name.trim()}
                style={({ pressed }) => [
                  styles.modalBtn,
                  pressed && styles.pressed,
                  (creating || !name.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.modalBtnAccent}>CREATE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={suggestOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSuggestOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              SUGGESTIONS
            </Text>
            <ScrollView contentContainerStyle={{ paddingBottom: 10 }}>
              {suggestions.length ? (
                suggestions.map((s, i) => (
                  <Pressable
                    key={`${s.name}-${i}`}
                    onPress={() => void addSuggestion(s)}
                    style={({ pressed }) => [styles.suggestRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.gadgetName}>{s.name}</Text>
                    <Text style={styles.desc} numberOfLines={2}>
                      {s.description}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.desc}>No suggestions.</Text>
              )}
            </ScrollView>
            <Pressable
              onPress={() => setSuggestOpen(false)}
              style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
            >
              <Text style={styles.modalBtnMuted}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safe: { flex: 1, backgroundColor: Colors.background },
  loading: { height: 0 },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  pressed: { opacity: 0.75 },

  failsafeCard: {
    borderWidth: 1,
    borderColor: FS_RED,
    padding: 16,
    marginBottom: 16,
  },
  failsafeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  failsafeHeaderLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: FS_RED,
  },
  fsStatusBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fsStatusBadgeText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  failsafeDirective: {
    marginTop: 12,
    fontSize: 15,
    fontStyle: 'italic',
    color: Colors.textPrimary,
  },
  failsafeDirectivePlaceholder: {
    fontStyle: 'italic',
    color: Colors.textSecondary,
  },
  memWipePending: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  memWipeImplemented: {
    marginTop: 10,
    fontSize: 12,
    color: FS_RED,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  trlDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: {
    height: 36,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  headerBtnPressed: { opacity: 0.7 },
  headerBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },

  suitCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  suitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  suitLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  suitPriority: { marginTop: 10, fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: { backgroundColor: Colors.border, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { color: Colors.textSecondary, fontSize: 12 },

  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  gadgetCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  gadgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  gadgetName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  trl: { marginTop: 8, fontSize: 12, color: Colors.textSecondary },
  desc: { marginTop: 6, fontSize: 14, color: Colors.textSecondary },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, marginBottom: 12 },
  modalInput: {
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
  modalInputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtn: { height: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  modalBtnMuted: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },
  modalBtnAccent: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  suggestRow: { borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
});

