import { Stack, router, useLocalSearchParams } from 'expo-router';
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
  attachToCase,
  deleteGadget,
  fetchActiveCases,
  getGadget,
  requestGadgetAssessment,
  updateGadget,
  type CaseBoardRow,
  type GadgetRow,
  type GadgetStatus,
} from '../services/api';

function badgeColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'field_ready') return Colors.signalOnline;
  if (s === 'in_development') return Colors.accent;
  if (s === 'retired') return Colors.alert;
  return Colors.textSecondary;
}

export default function GadgetDetailScreen() {
  const params = useLocalSearchParams<{ gadget_id?: string }>();
  const gadgetId = String(params.gadget_id || '').trim();

  const [gadget, setGadget] = useState<GadgetRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const [name, setName] = useState('');
  const [status, setStatus] = useState<GadgetStatus>('concept');
  const [trl, setTrl] = useState('4');
  const [description, setDescription] = useState('');
  const [buildNotes, setBuildNotes] = useState('');
  const [materials, setMaterials] = useState('');
  const [saving, setSaving] = useState(false);

  const [cases, setCases] = useState<CaseBoardRow[]>([]);
  const activeCases = useMemo(
    () => cases.filter((c) => !['closed', 'terminated', 'archived'].includes(String(c.status || '').toLowerCase())),
    [cases]
  );

  const load = useCallback(async () => {
    if (!gadgetId) return;
    const g = await getGadget(gadgetId);
    setGadget(g);
    if (g) {
      setName(g.name ?? '');
      setStatus((g.status ?? 'concept') as GadgetStatus);
      setTrl(String(g.trl ?? 4));
      setDescription(g.description ?? '');
      setBuildNotes(g.build_notes ?? '');
      setMaterials(g.materials ?? '');
    }
  }, [gadgetId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!attachOpen) return;
    (async () => {
      const rows = await fetchActiveCases();
      setCases(rows);
    })();
  }, [attachOpen]);

  const onAssess = useCallback(async () => {
    if (!gadgetId) return;
    const g = await requestGadgetAssessment(gadgetId);
    if (g) {
      setGadget(g);
      setName(g.name ?? '');
      setStatus((g.status ?? 'concept') as GadgetStatus);
      setTrl(String(g.trl ?? 4));
      setDescription(g.description ?? '');
      setBuildNotes(g.build_notes ?? '');
      setMaterials(g.materials ?? '');
    }
  }, [gadgetId]);

  const onSave = useCallback(async () => {
    if (!gadgetId || saving) return;
    const n = name.trim();
    const d = description.trim();
    const t = Math.max(1, Math.min(9, Number(trl || 1)));
    if (!n) return;
    setSaving(true);
    const g = await updateGadget(gadgetId, {
      name: n,
      status,
      trl: t,
      description: d,
      build_notes: String(buildNotes ?? ''),
      materials: String(materials ?? ''),
    });
    setSaving(false);
    if (g) {
      setGadget(g);
      setEditOpen(false);
    }
  }, [gadgetId, saving, name, description, trl, status, buildNotes, materials]);

  const onDelete = useCallback(() => {
    if (!gadgetId) return;
    Alert.alert('DELETE', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'DELETE',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteGadget(gadgetId);
          if (ok) router.back();
        },
      },
    ]);
  }, [gadgetId]);

  const onAttach = useCallback(
    async (c: CaseBoardRow) => {
      if (!gadgetId) return;
      const ok = await attachToCase({
        case_id: c.case_id,
        attachment_type: 'gadget',
        content: JSON.stringify({ gadget_id: gadgetId, name: gadget?.name ?? name }, null, 2),
        metadata: { gadget_id: gadgetId, gadget_name: gadget?.name ?? name },
      });
      if (ok) setAttachOpen(false);
    },
    [gadgetId, gadget, name]
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: gadget?.name || 'Gadget' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{gadget?.name || '—'}</Text>

          <View style={styles.metaRow}>
            <View style={[styles.badge, { borderColor: badgeColor(String(gadget?.status ?? status)) }]}>
              <Text
                style={[styles.badgeText, { color: badgeColor(String(gadget?.status ?? status)) }]}
                allowFontScaling={false}
              >
                {String(gadget?.status ?? status).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.trl}>TRL {gadget?.trl ?? Number(trl || 1)}</Text>
          </View>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            DESCRIPTION
          </Text>
          <Text style={styles.body}>{gadget?.description || '—'}</Text>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            BUILD NOTES
          </Text>
          <Text style={styles.body}>{gadget?.build_notes || '—'}</Text>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            MATERIALS
          </Text>
          <Text style={styles.body}>{gadget?.materials || '—'}</Text>

          <Text style={styles.sectionLabel} allowFontScaling={false}>
            BRUCE'S ENGINEERING ASSESSMENT
          </Text>
          <Text style={styles.brief}>{gadget?.bruce_briefing?.trim() || '—'}</Text>
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
            onPress={() => setEditOpen(true)}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Update gadget"
          >
            <Text style={styles.btnTextMuted} allowFontScaling={false}>
              UPDATE
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomBar2}>
          <Pressable
            onPress={() => setAttachOpen(true)}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Attach to case"
          >
            <Text style={styles.btnTextAccent} allowFontScaling={false}>
              ATTACH TO CASE
            </Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Delete gadget"
          >
            <Text style={[styles.btnTextMuted, { color: Colors.alert }]} allowFontScaling={false}>
              DELETE
            </Text>
          </Pressable>
        </View>
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
              UPDATE GADGET
            </Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={Colors.textSecondary}
            />
            <TextInput
              style={styles.modalInput}
              value={String(status)}
              onChangeText={(t) => setStatus((t.trim() || 'concept') as GadgetStatus)}
              placeholder="Status"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.modalInput}
              value={trl}
              onChangeText={setTrl}
              placeholder="TRL (1-9)"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMulti]}
              value={buildNotes}
              onChangeText={setBuildNotes}
              placeholder="Build notes"
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMulti]}
              value={materials}
              onChangeText={setMaterials}
              placeholder="Materials"
              placeholderTextColor={Colors.textSecondary}
              multiline
            />
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
                disabled={saving || !name.trim()}
                style={({ pressed }) => [
                  styles.modalBtn,
                  pressed && styles.pressed,
                  (saving || !name.trim()) && styles.disabled,
                ]}
              >
                <Text style={styles.btnTextAccent} allowFontScaling={false}>
                  SAVE
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={attachOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              ATTACH TO CASE
            </Text>
            <ScrollView contentContainerStyle={{ paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
              {activeCases.length ? (
                activeCases.map((c) => (
                  <Pressable
                    key={c.case_id}
                    onPress={() => void onAttach(c)}
                    style={({ pressed }) => [styles.caseRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.caseId} allowFontScaling={false}>
                      {c.case_id}
                    </Text>
                    <Text style={styles.caseTitle} numberOfLines={1}>
                      {c.title}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.body}>No active cases.</Text>
              )}
            </ScrollView>
            <Pressable
              onPress={() => setAttachOpen(false)}
              style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
            >
              <Text style={styles.btnTextMuted} allowFontScaling={false}>
                CLOSE
              </Text>
            </Pressable>
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

  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  trl: { fontSize: 12, color: Colors.textSecondary },

  sectionLabel: { marginTop: 18, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },
  body: { marginTop: 8, fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  brief: { marginTop: 8, fontSize: 15, fontStyle: 'italic', color: Colors.textPrimary, lineHeight: 24 },

  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  bottomBar2: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  btn: { flex: 1, height: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  btnTextAccent: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, fontWeight: '700' },
  btnTextMuted: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.textSecondary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 18 },
  modalCard: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent, marginBottom: 12 },
  modalInput: { minHeight: 44, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.inputBackground, color: Colors.textPrimary, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  modalInputMulti: { minHeight: 90, textAlignVertical: 'top' },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalBtn: { height: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },

  caseRow: { borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 10 },
  caseId: { fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: Colors.accent },
  caseTitle: { marginTop: 6, fontSize: 14, color: Colors.textPrimary },
});

