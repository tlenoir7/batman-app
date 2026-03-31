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
  createProfile,
  deleteProfilePermanent,
  fetchProfiles,
  terminateProfile,
  type ProfileRow,
} from '../services/api';

export default function ProfilesScreen() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchProfiles();
    setProfiles(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setName('');
    setRole('');
    setNotes('');
    setCreateOpen(true);
  }, []);

  const submit = useCallback(async () => {
    const n = name.trim();
    const r = role.trim() || 'UNKNOWN';
    const nt = notes.trim();
    if (!n || creating) return;
    setCreating(true);
    const row = await createProfile({ name: n, role: r, notes: nt });
    setCreating(false);
    if (!row) return;
    setCreateOpen(false);
    await load();
  }, [name, role, notes, creating, load]);

  const showEmpty = !loading && profiles.length === 0;

  const isTerminated = useCallback((p: ProfileRow) => {
    const metaStatus = String(p.metadata?.status ?? p.status ?? '').toLowerCase();
    return metaStatus === 'terminated' || metaStatus === 'closed' || metaStatus === 'archived';
  }, []);

  const sortedProfiles = useMemo(() => {
    const active: ProfileRow[] = [];
    const inactive: ProfileRow[] = [];
    for (const p of profiles) {
      (isTerminated(p) ? inactive : active).push(p);
    }
    return [...active, ...inactive];
  }, [profiles, isTerminated]);

  const confirmProfileActions = useCallback(
    (p: ProfileRow) => {
      Alert.alert(p.name || p.profile_id, undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'TERMINATE',
          style: 'destructive',
          onPress: async () => {
            const ok = await terminateProfile(p.profile_id);
            if (ok) {
              setProfiles((prev) =>
                prev.map((x) =>
                  x.profile_id === p.profile_id
                    ? {
                        ...x,
                        status: 'terminated',
                        metadata: { ...(x.metadata ?? {}), status: 'terminated' },
                      }
                    : x
                )
              );
            }
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
                  const ok = await deleteProfilePermanent(p.profile_id);
                  if (ok) {
                    setProfiles((prev) =>
                      prev.filter((x) => x.profile_id !== p.profile_id)
                    );
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
          title: 'Profiles',
          headerBackTitle: 'Briefing',
          headerRight: () => (
            <Pressable
              onPress={openCreate}
              style={({ pressed }) => [
                styles.headerBtn,
                pressed && styles.headerBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Create profile"
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
            <Text style={styles.emptyText}>No profiles.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {sortedProfiles.map((p, i) => {
              const terminated = isTerminated(p);
              return (
              <Pressable
                key={`${p.profile_id}-${i}`}
                onPress={() =>
                  router.push({
                    pathname: './profiledetail',
                    params: { profile_id: p.profile_id },
                  })
                }
                onLongPress={() => confirmProfileActions(p)}
                style={styles.card}
                accessibilityRole="button"
                accessibilityLabel={`Open ${p.name}`}
              >
                {terminated ? (
                  <View pointerEvents="none" style={styles.terminatedStampWrap}>
                    <Text style={styles.terminatedStamp}>TERMINATED</Text>
                  </View>
                ) : null}
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.role} allowFontScaling={false}>
                  {String(p.role || 'UNKNOWN')}
                </Text>
                <Text style={styles.summary} numberOfLines={1} ellipsizeMode="tail">
                  {p.summary || '—'}
                </Text>
                <Text style={styles.lastUpdated}>{p.last_updated || '—'}</Text>
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
              NEW PROFILE
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
              value={role}
              onChangeText={setRole}
              placeholder="Role (ALLY, SUBJECT, UNKNOWN, THREAT)"
              placeholderTextColor={Colors.textSecondary}
              editable={!creating}
              autoCapitalize="characters"
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Initial notes"
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
                onPress={() => void submit()}
                disabled={creating || !name.trim()}
                style={({ pressed }) => [
                  styles.modalBtnPrimary,
                  pressed && styles.modalBtnPressed,
                  (creating || !name.trim()) && styles.modalBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create profile"
              >
                <Text style={styles.modalBtnPrimaryText}>CREATE</Text>
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
  safe: { flex: 1, backgroundColor: Colors.background },
  loadingWrap: { flex: 1, backgroundColor: Colors.background },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
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
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  role: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 8,
  },
  summary: { fontSize: 14, color: Colors.textSecondary, marginBottom: 8 },
  lastUpdated: { fontSize: 12, color: Colors.textSecondary },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  headerBtnPressed: { opacity: 0.65 },
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
  modalInputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  modalBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  modalBtnPrimary: { paddingHorizontal: 12, paddingVertical: 10 },
  modalBtnPressed: { opacity: 0.7 },
  modalBtnDisabled: { opacity: 0.35 },
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

