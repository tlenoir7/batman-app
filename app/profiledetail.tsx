import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import {
  deleteProfilePermanent,
  getProfile,
  requestProfileAnalysis,
  terminateProfile,
  type ProfileRow,
} from '../services/api';

export default function ProfileDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const profileId = String(params.profile_id || '').trim();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [requesting, setRequesting] = useState(false);

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

  useEffect(() => {
    void load();
  }, [load]);

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
});

