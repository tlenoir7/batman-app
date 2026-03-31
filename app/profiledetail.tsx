import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import {
  deleteProfilePermanent,
  fetchActiveCases,
  fetchLinkedCases,
  getProfile,
  linkProfileToCase,
  requestProfileAnalysis,
  terminateProfile,
  unlinkProfileFromCase,
  type CaseBoardRow,
  type ProfileRow,
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

export default function ProfileDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const profileId = String(params.profile_id || '').trim();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [linkedCases, setLinkedCases] = useState<CaseBoardRow[]>([]);
  const [linkCaseModalOpen, setLinkCaseModalOpen] = useState(false);
  const [casePicker, setCasePicker] = useState<CaseBoardRow[]>([]);
  const [casePickerLoading, setCasePickerLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profileId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const p = await getProfile(profileId);
    setProfile(p);
    setLoading(false);
  }, [profileId]);

  const loadLinkedCases = useCallback(async () => {
    if (!profileId) {
      setLinkedCases([]);
      return;
    }
    const rows = await fetchLinkedCases(profileId);
    setLinkedCases(rows);
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadLinkedCases();
  }, [loadLinkedCases]);

  const onRequestAnalysis = useCallback(async () => {
    if (!profileId || requesting) return;
    setRequesting(true);
    const updated = await requestProfileAnalysis(profileId);
    if (updated) setProfile(updated);
    setRequesting(false);
  }, [profileId, requesting]);

  const onTerminate = useCallback(async () => {
    if (!profileId) return;
    await terminateProfile(profileId);
    router.back();
  }, [profileId]);

  const onDelete = useCallback(async () => {
    if (!profileId) return;
    Alert.alert('This cannot be undone.', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'DELETE',
        style: 'destructive',
        onPress: async () => {
          await deleteProfilePermanent(profileId);
          router.back();
        },
      },
    ]);
  }, [profileId]);

  const openLinkCaseModal = useCallback(async () => {
    setLinkCaseModalOpen(true);
    setCasePickerLoading(true);
    const rows = await fetchActiveCases();
    setCasePicker(rows);
    setCasePickerLoading(false);
  }, []);

  const onLinkCase = useCallback(
    async (c: CaseBoardRow) => {
      if (!profileId) return;
      const ok = await linkProfileToCase(profileId, c.case_id);
      if (ok) {
        setLinkCaseModalOpen(false);
        await loadLinkedCases();
      }
    },
    [profileId, loadLinkedCases]
  );

  const confirmUnlinkCase = useCallback(
    (c: CaseBoardRow) => {
      if (!profileId) return;
      Alert.alert('Unlink case?', `${c.case_id}`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'UNLINK',
          style: 'destructive',
          onPress: async () => {
            const ok = await unlinkProfileFromCase(profileId, c.case_id);
            if (ok) await loadLinkedCases();
          },
        },
      ]);
    },
    [profileId, loadLinkedCases]
  );

  const onOpenLinkedCase = useCallback((c: CaseBoardRow) => {
    router.push({
      pathname: './casedetail',
      params: { case: encodeURIComponent(JSON.stringify(c)) },
    });
  }, []);

  const linkedIds = new Set(linkedCases.map((x) => x.case_id));
  const availableCases = casePicker.filter((c) => !linkedIds.has(c.case_id));

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: profile?.name ? profile.name : 'Profile',
          headerStyle: { backgroundColor: Colors.primary },
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: { color: Colors.textPrimary },
          contentStyle: { backgroundColor: Colors.background },
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loading ? (
          <View style={styles.loadingWrap} />
        ) : profile ? (
          <>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.name}>{profile.name}</Text>
              <Text style={styles.role} allowFontScaling={false}>
                {String(profile.role || 'UNKNOWN')}
              </Text>
              <Text style={styles.lastUpdated}>{profile.last_updated || '—'}</Text>

              <Text style={styles.sectionLabel} allowFontScaling={false}>
                BRUCE ANALYSIS
              </Text>
              <Text style={styles.analysis}>
                {profile.bruce_analysis?.trim() ? profile.bruce_analysis : '—'}
              </Text>

              <Text style={styles.sectionLabel} allowFontScaling={false}>
                NOTES
              </Text>
              <Text style={styles.notes}>
                {profile.notes?.trim() ? profile.notes : profile.summary || '—'}
              </Text>

              <Text style={styles.sectionLabel} allowFontScaling={false}>
                LINKED CASES
              </Text>
              <Pressable
                onPress={() => void openLinkCaseModal()}
                style={({ pressed }) => [styles.linkToCaseBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Link to case"
              >
                <Text style={styles.linkToCaseBtnText}>LINK TO CASE</Text>
              </Pressable>
              {linkedCases.length === 0 ? (
                <Text style={styles.linkedEmpty}>No linked cases.</Text>
              ) : (
                linkedCases.map((c) => {
                  const terminated = isTerminatedStatus(String(c.status || ''));
                  return (
                    <Pressable
                      key={c.case_id}
                      onPress={() => onOpenLinkedCase(c)}
                      onLongPress={() => confirmUnlinkCase(c)}
                      style={({ pressed }) => [
                        styles.caseCard,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.case_id}. Long press to unlink.`}
                    >
                      <View style={styles.caseCardTop}>
                        <Text style={styles.caseCardId} allowFontScaling={false}>
                          {c.case_id}
                        </Text>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: statusDotColor(String(c.status || '')) },
                          ]}
                        />
                      </View>
                      <Text style={styles.caseCardTitle} numberOfLines={2}>
                        {c.title || 'Untitled case'}
                      </Text>
                      {terminated ? (
                        <Text style={styles.caseCardMeta} allowFontScaling={false}>
                          {String(c.status || '')}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View
              style={[
                styles.bottomBar,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <Pressable
                onPress={() => void onRequestAnalysis()}
                disabled={requesting}
                style={({ pressed }) => [
                  styles.requestBtn,
                  pressed && styles.requestBtnPressed,
                  requesting && styles.requestBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Request analysis"
              >
                <Text style={styles.requestBtnText}>REQUEST ANALYSIS</Text>
              </Pressable>
              <View style={styles.rowBtns}>
                <Pressable
                  onPress={() => void onTerminate()}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.requestBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Terminate profile"
                >
                  <Text style={styles.secondaryBtnText}>TERMINATE</Text>
                </Pressable>
                <Pressable
                  onPress={() => void onDelete()}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && styles.requestBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete profile permanently"
                >
                  <Text style={styles.dangerBtnText}>DELETE</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No profile selected.</Text>
          </View>
        )}
      </SafeAreaView>

      <Modal
        visible={linkCaseModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setLinkCaseModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLinkCaseModalOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Pressable
            style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle} allowFontScaling={false}>
              LINK TO CASE
            </Text>
            {casePickerLoading ? (
              <Text style={styles.linkedEmpty}>Loading…</Text>
            ) : (
              <ScrollView style={styles.modalScroll} nestedScrollEnabled>
                {availableCases.length === 0 ? (
                  <Text style={styles.linkedEmpty}>No cases to link.</Text>
                ) : (
                  availableCases.map((c) => (
                    <Pressable
                      key={c.case_id}
                      onPress={() => void onLinkCase(c)}
                      style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}
                    >
                      <View style={styles.caseCardTop}>
                        <Text style={styles.caseCardId} allowFontScaling={false}>
                          {c.case_id}
                        </Text>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: statusDotColor(String(c.status || '')) },
                          ]}
                        />
                      </View>
                      <Text style={styles.caseCardTitle} numberOfLines={2}>
                        {c.title || 'Untitled case'}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}
            <Pressable
              onPress={() => setLinkCaseModalOpen(false)}
              style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
            >
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </Pressable>
          </Pressable>
        </Pressable>
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
    paddingTop: 14,
    paddingBottom: 18,
  },
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  role: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 8,
  },
  lastUpdated: { fontSize: 12, color: Colors.textSecondary },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginTop: 18,
    marginBottom: 8,
  },
  analysis: { fontSize: 14, lineHeight: 22, color: Colors.textPrimary },
  notes: { fontSize: 14, lineHeight: 22, color: Colors.textSecondary },
  linkToCaseBtn: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingVertical: 8,
  },
  linkToCaseBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2d4a8a',
    fontWeight: '700',
  },
  linkedEmpty: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  caseCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 8,
  },
  caseCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  caseCardId: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  caseCardTitle: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  caseCardMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
  },
  requestBtn: {
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtnPressed: { opacity: 0.75 },
  requestBtnDisabled: { opacity: 0.35 },
  requestBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },
  rowBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },
  dangerBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.alert,
    fontWeight: '700',
  },
  pressed: { opacity: 0.75 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: '#1f2937',
    padding: 16,
    maxHeight: '75%',
  },
  modalTitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2d4a8a',
    marginBottom: 12,
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  modalClose: {
    marginTop: 16,
    alignSelf: 'flex-end',
    paddingVertical: 8,
  },
  modalCloseText: {
    fontSize: 10,
    letterSpacing: 2,
    color: Colors.accent,
    fontWeight: '700',
  },
});
