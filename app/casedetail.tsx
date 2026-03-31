import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  closeCase,
  deleteCasePermanent,
  fetchCaseTimeline,
  fetchLinkedProfiles,
  fetchProfiles,
  linkProfileToCase,
  unlinkProfileFromCase,
  type CaseBoardRow,
  type LinkedProfileRow,
  type ProfileRow,
  type TimelineEntry,
  type TimelineEntryType,
} from '../services/api';

function parseCaseParam(raw: unknown): CaseBoardRow | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const obj: unknown = JSON.parse(decoded);
    if (!obj || typeof obj !== 'object') return null;
    const row = obj as CaseBoardRow;
    if (typeof row.case_id !== 'string') return null;
    return row;
  } catch {
    return null;
  }
}

function iconForTimelineType(t: TimelineEntryType): keyof typeof Ionicons.glyphMap {
  switch (t) {
    case 'forensic':
      return 'attach-outline';
    case 'osint':
      return 'search-outline';
    case 'profile_link':
      return 'person-outline';
    case 'conversation_update':
      return 'chatbubble-outline';
    case 'case_opened':
      return 'folder-outline';
    default:
      return 'ellipse-outline';
  }
}

function formatTimelineTimestamp(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '—';
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }
  return s;
}

function roleBadgeText(role: string): string {
  return String(role || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
}

export default function CaseDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const row = useMemo(() => parseCaseParam(params.case), [params.case]);

  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const [linkedProfiles, setLinkedProfiles] = useState<LinkedProfileRow[]>([]);
  const [linkProfileModalOpen, setLinkProfileModalOpen] = useState(false);
  const [profilePicker, setProfilePicker] = useState<ProfileRow[]>([]);
  const [profilePickerLoading, setProfilePickerLoading] = useState(false);

  const refreshTimelineAndLinks = useCallback(async () => {
    if (!row?.case_id) return;
    const [tl, lp] = await Promise.all([
      fetchCaseTimeline(row.case_id),
      fetchLinkedProfiles(row.case_id),
    ]);
    setTimeline(tl);
    setLinkedProfiles(lp);
  }, [row?.case_id]);

  useEffect(() => {
    if (!row?.case_id) {
      setTimeline([]);
      setLinkedProfiles([]);
      return;
    }
    let cancelled = false;
    setTimelineLoading(true);
    void Promise.all([fetchCaseTimeline(row.case_id), fetchLinkedProfiles(row.case_id)])
      .then(([tl, lp]) => {
        if (!cancelled) {
          setTimeline(tl);
          setLinkedProfiles(lp);
        }
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row?.case_id]);

  const openLinkProfileModal = useCallback(async () => {
    if (!row?.case_id) return;
    setLinkProfileModalOpen(true);
    setProfilePickerLoading(true);
    const rows = await fetchProfiles();
    setProfilePicker(rows);
    setProfilePickerLoading(false);
  }, [row?.case_id]);

  const onLinkProfile = useCallback(
    async (p: ProfileRow) => {
      if (!row?.case_id) return;
      const ok = await linkProfileToCase(p.profile_id, row.case_id);
      if (ok) {
        setLinkProfileModalOpen(false);
        await refreshTimelineAndLinks();
      }
    },
    [row?.case_id, refreshTimelineAndLinks]
  );

  const confirmUnlinkProfile = useCallback(
    (p: LinkedProfileRow) => {
      if (!row?.case_id) return;
      Alert.alert('Unlink profile?', `${p.name} (${p.profile_id})`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'UNLINK',
          style: 'destructive',
          onPress: async () => {
            const ok = await unlinkProfileFromCase(p.profile_id, row.case_id);
            if (ok) await refreshTimelineAndLinks();
          },
        },
      ]);
    },
    [row?.case_id, refreshTimelineAndLinks]
  );

  const onOpenLinkedProfile = useCallback((p: LinkedProfileRow) => {
    router.push({
      pathname: './profiledetail',
      params: { profile_id: p.profile_id },
    });
  }, []);

  const metaJson = useMemo(() => {
    if (!row?.metadata) return '';
    try {
      return JSON.stringify(row.metadata, null, 2);
    } catch {
      return String(row.metadata);
    }
  }, [row?.metadata]);

  const onTerminate = useCallback(async () => {
    if (!row) return;
    await closeCase(row.case_id);
    router.back();
  }, [row]);

  const onDelete = useCallback(async () => {
    if (!row) return;
    Alert.alert('This cannot be undone.', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'DELETE',
        style: 'destructive',
        onPress: async () => {
          await deleteCasePermanent(row.case_id);
          router.back();
        },
      },
    ]);
  }, [row]);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: row?.case_id ? String(row.case_id) : 'Case Detail',
          headerStyle: { backgroundColor: Colors.primary },
          headerTintColor: Colors.textPrimary,
          headerTitleStyle: { color: Colors.textPrimary },
          contentStyle: { backgroundColor: Colors.background },
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {row ? (
            <>
              <Text style={styles.caseId} allowFontScaling={false}>
                {row.case_id}
              </Text>
              <View style={styles.row}>
                <Text style={styles.k}>STATUS</Text>
                <Text style={styles.v}>{String(row.status || '—')}</Text>
              </View>
              <Text style={styles.title}>{row.title || 'Untitled case'}</Text>
              <View style={styles.row}>
                <Text style={styles.k}>LAST UPDATE</Text>
                <Text style={styles.v}>{row.last_update || '—'}</Text>
              </View>
              <Text style={styles.sectionLabel} allowFontScaling={false}>
                SUMMARY
              </Text>
              <Text style={styles.body}>{row.summary || '—'}</Text>

              <Text style={styles.sectionLabel} allowFontScaling={false}>
                TIMELINE
              </Text>
              {timelineLoading ? (
                <Text style={styles.timelineEmpty}>Loading…</Text>
              ) : timeline.length === 0 ? (
                <Text style={styles.timelineEmpty}>No activity yet.</Text>
              ) : (
                timeline.map((entry, index) => (
                  <Pressable
                    key={entry.id}
                    onPress={() => setSelectedEntry(entry)}
                    style={[
                      styles.timelineRow,
                      index < timeline.length - 1 && styles.timelineRowDivider,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${entry.label}. ${entry.summary}`}
                  >
                    <Ionicons
                      name={iconForTimelineType(entry.type)}
                      size={20}
                      color="#2d4a8a"
                      style={styles.timelineIcon}
                    />
                    <View style={styles.timelineCol}>
                      <Text style={styles.timelineTs} allowFontScaling={false}>
                        {formatTimelineTimestamp(entry.timestamp)}
                      </Text>
                      <Text style={styles.timelineLabel} allowFontScaling={false}>
                        {entry.label}
                      </Text>
                      <Text style={styles.timelineSummary} numberOfLines={3}>
                        {entry.summary || '—'}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}

              <Text style={styles.sectionLabel} allowFontScaling={false}>
                LINKED PROFILES
              </Text>
              <Pressable
                onPress={() => void openLinkProfileModal()}
                style={({ pressed }) => [styles.linkActionBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Link profile to case"
              >
                <Text style={styles.linkActionBtnText}>LINK PROFILE</Text>
              </Pressable>
              {linkedProfiles.length === 0 ? (
                <Text style={styles.timelineEmpty}>No linked profiles.</Text>
              ) : (
                linkedProfiles.map((p) => (
                  <Pressable
                    key={p.profile_id}
                    onPress={() => onOpenLinkedProfile(p)}
                    onLongPress={() => confirmUnlinkProfile(p)}
                    style={({ pressed }) => [
                      styles.linkedProfileCard,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name}. Long press to unlink.`}
                  >
                    <View style={styles.linkedProfileRow}>
                      <Text style={styles.linkedProfileName} numberOfLines={1}>
                        {p.name || p.profile_id}
                      </Text>
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleBadgeText} allowFontScaling={false}>
                          {roleBadgeText(p.role)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))
              )}

              <Text style={styles.sectionLabel} allowFontScaling={false}>
                CONTENT
              </Text>
              <Text style={styles.body}>{row.content || row.summary || '—'}</Text>
              <Text style={styles.sectionLabel} allowFontScaling={false}>
                METADATA
              </Text>
              <Text style={styles.meta}>{metaJson || '—'}</Text>
            </>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No case selected.</Text>
            </View>
          )}
        </ScrollView>

        {row ? (
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <Pressable
              onPress={() => void onTerminate()}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Terminate case"
            >
              <Text style={styles.actionAccent}>TERMINATE</Text>
            </Pressable>
            <Pressable
              onPress={() => void onDelete()}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Delete case permanently"
            >
              <Text style={styles.actionDanger}>DELETE</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>

      <Modal
        visible={selectedEntry != null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedEntry(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedEntry(null)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Pressable
            style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedEntry ? (
              <>
                <View style={styles.modalHeader}>
                  <Ionicons
                    name={iconForTimelineType(selectedEntry.type)}
                    size={22}
                    color="#2d4a8a"
                  />
                  <Text style={styles.modalLabel} allowFontScaling={false}>
                    {selectedEntry.label}
                  </Text>
                </View>
                <Text style={styles.modalTs} allowFontScaling={false}>
                  {formatTimelineTimestamp(selectedEntry.timestamp)}
                </Text>
                <ScrollView
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  <Text style={styles.modalBody}>{selectedEntry.full_content || '—'}</Text>
                </ScrollView>
                <Pressable
                  onPress={() => setSelectedEntry(null)}
                  style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={styles.modalCloseText}>CLOSE</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={linkProfileModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setLinkProfileModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLinkProfileModalOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Pressable
            style={[styles.modalCard, styles.linkPickerCard, { paddingBottom: Math.max(insets.bottom, 20) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.linkPickerTitle} allowFontScaling={false}>
              LINK PROFILE
            </Text>
            {profilePickerLoading ? (
              <Text style={styles.timelineEmpty}>Loading…</Text>
            ) : (
              <ScrollView style={styles.linkPickerScroll} nestedScrollEnabled>
                {profilePicker.filter(
                  (p) => !linkedProfiles.some((lp) => lp.profile_id === p.profile_id)
                ).length === 0 ? (
                  <Text style={styles.timelineEmpty}>No profiles to link.</Text>
                ) : (
                  profilePicker
                    .filter((p) => !linkedProfiles.some((lp) => lp.profile_id === p.profile_id))
                    .map((p) => (
                      <Pressable
                        key={p.profile_id}
                        onPress={() => void onLinkProfile(p)}
                        style={({ pressed }) => [
                          styles.linkPickerRow,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.linkedProfileName}>{p.name}</Text>
                        <Text style={styles.linkPickerMeta} allowFontScaling={false}>
                          {p.profile_id}
                        </Text>
                      </Pressable>
                    ))
                )}
              </ScrollView>
            )}
            <Pressable
              onPress={() => setLinkProfileModalOpen(false)}
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
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  caseId: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  k: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
  },
  v: {
    fontSize: 12,
    color: Colors.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textSecondary,
    fontFamily: undefined,
  },
  timelineEmpty: {
    fontSize: 14,
    color: '#6b7280',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  timelineRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  timelineIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  timelineCol: {
    flex: 1,
    minWidth: 0,
  },
  timelineTs: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  timelineLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2d4a8a',
    marginBottom: 6,
  },
  timelineSummary: {
    fontSize: 14,
    lineHeight: 20,
    color: '#e8e8e8',
  },
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2d4a8a',
    flex: 1,
  },
  modalTs: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
  },
  modalScroll: {
    maxHeight: 320,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 22,
    color: '#e8e8e8',
  },
  modalClose: {
    marginTop: 16,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  modalCloseText: {
    fontSize: 10,
    letterSpacing: 2,
    color: Colors.accent,
    fontWeight: '700',
  },
  linkActionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 0,
    marginBottom: 10,
  },
  linkActionBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2d4a8a',
    fontWeight: '700',
  },
  linkedProfileCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  linkedProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  linkedProfileName: {
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  roleBadge: {
    borderWidth: 1,
    borderColor: '#2d4a8a',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roleBadgeText: {
    fontSize: 9,
    letterSpacing: 1,
    color: '#2d4a8a',
    fontWeight: '600',
  },
  linkPickerCard: {
    maxHeight: '70%',
  },
  linkPickerTitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2d4a8a',
    marginBottom: 12,
  },
  linkPickerScroll: {
    maxHeight: 360,
  },
  linkPickerRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  linkPickerMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.background,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: { opacity: 0.75 },
  actionAccent: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },
  actionDanger: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.alert,
    fontWeight: '700',
  },
});
