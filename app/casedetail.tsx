import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import type { CaseBoardRow } from '../services/api';

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

export default function CaseDetailScreen() {
  const params = useLocalSearchParams();
  const row = useMemo(() => parseCaseParam(params.case), [params.case]);

  const metaJson = useMemo(() => {
    if (!row?.metadata) return '';
    try {
      return JSON.stringify(row.metadata, null, 2);
    } catch {
      return String(row.metadata);
    }
  }, [row?.metadata]);

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
});

