import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { getProfile, requestProfileAnalysis, type ProfileRow } from '../services/api';

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
});

