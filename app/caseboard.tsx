import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { type CaseBoardRow, fetchActiveCases } from '../services/api';

function statusDotColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'dormant') return Colors.textSecondary;
  if (s === 'critical') return Colors.alert;
  return Colors.signalOnline;
}

export default function CaseBoardScreen() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<CaseBoardRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchActiveCases();
    setCases(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showEmpty = !loading && cases.length === 0;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loading ? (
          <View style={styles.loadingWrap} />
        ) : showEmpty ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No active cases.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {cases.map((c, i) => (
              <View key={`${c.case_id}-${i}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.caseId} allowFontScaling={false}>
                    {c.case_id}
                  </Text>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: statusDotColor(c.status) },
                    ]}
                  />
                </View>
                <Text style={styles.title}>{c.title}</Text>
                <Text style={styles.lastUpdate}>{c.last_update || '—'}</Text>
                <Text style={styles.summary} numberOfLines={1} ellipsizeMode="tail">
                  {c.summary || '—'}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
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
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
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
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  caseId: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  lastUpdate: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
