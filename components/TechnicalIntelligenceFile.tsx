import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '../constants/colors';
import { TECHNICAL_FILE_SECTION_ORDER, type TechnicalFileSectionId } from '../services/api';

const CONTENT_TEXT = {
  fontSize: 14,
  color: Colors.textPrimary,
  lineHeight: 22,
} as const;

function sectionHeaderAccent(id: string): string | undefined {
  if (id === 'FAILURE POINTS' || id === 'FAILURE MODES') return Colors.alert;
  if (id === 'OPTIMIZATION PATHS') return Colors.accent;
  return undefined;
}

function renderManufacturingPathway(content: string) {
  const parts = content
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    return (
      <View>
        {parts.slice(0, 3).map((p, i) => (
          <View key={`stage-${i}`} style={styles.stageBlock}>
            <Text style={styles.stageLabel} allowFontScaling={false}>
              STAGE {i + 1}
            </Text>
            <Text style={styles.contentText}>{p}</Text>
          </View>
        ))}
      </View>
    );
  }
  return <Text style={styles.contentText}>{content}</Text>;
}

function renderAssemblySteps(content: string) {
  const lines = content.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return <Text style={styles.contentText}>—</Text>;
  return (
    <View>
      {lines.map((line, i) => (
        <Text key={`step-${i}`} style={styles.contentText}>
          {i + 1}. {line}
        </Text>
      ))}
    </View>
  );
}

type Props = {
  /** Parsed sections from bruce_briefing */
  parsed: Record<string, string>;
  /** Suit only: capabilities list after TECHNICAL OVERVIEW */
  capabilities?: string[];
};

export function TechnicalIntelligenceFile({ parsed, capabilities }: Props) {
  const collapsibleIds = useMemo(() => {
    const rest = TECHNICAL_FILE_SECTION_ORDER.filter((id) => id !== 'TECHNICAL OVERVIEW');
    const withCap =
      capabilities && capabilities.length > 0
        ? (['CAPABILITIES' as const] as string[]).concat(rest)
        : rest;
    return withCap;
  }, [capabilities]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = { 'TECHNICAL OVERVIEW': true };
    for (const id of collapsibleIds) init[id] = false;
    return init;
  });

  useEffect(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = { ...prev, 'TECHNICAL OVERVIEW': true };
      for (const id of collapsibleIds) {
        if (next[id] === undefined) next[id] = false;
      }
      return next;
    });
  }, [collapsibleIds]);

  const toggle = useCallback((id: string) => {
    if (id === 'TECHNICAL OVERVIEW') return;
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const renderSectionBody = (id: string, content: string) => {
    if (id === 'ASSEMBLY INSTRUCTIONS') return renderAssemblySteps(content);
    if (id === 'MANUFACTURING PATHWAY') return renderManufacturingPathway(content);
    return <Text style={styles.contentText}>{content}</Text>;
  };

  const overviewContent = parsed['TECHNICAL OVERVIEW']?.trim() ?? '';

  return (
    <View style={styles.wrap}>
      {/* TECHNICAL OVERVIEW — always open */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionHeader, { color: Colors.accent }]} allowFontScaling={false}>
            TECHNICAL OVERVIEW
          </Text>
          <Ionicons name="chevron-down" size={16} color={Colors.accent} />
        </View>
        <Text style={[styles.contentText, styles.overviewProse]}>{overviewContent || '—'}</Text>
      </View>
      <View style={styles.divider} />

      {capabilities && capabilities.length > 0 ? (
        <>
          <CollapsibleSection
            id="CAPABILITIES"
            title="CAPABILITIES"
            expanded={expanded['CAPABILITIES'] ?? false}
            onToggle={() => toggle('CAPABILITIES')}
            accent={undefined}
          >
            {capabilities.map((line, i) => (
              <Text key={`cap-${i}`} style={styles.contentText}>
                • {line}
              </Text>
            ))}
          </CollapsibleSection>
          <View style={styles.divider} />
        </>
      ) : null}

      {TECHNICAL_FILE_SECTION_ORDER.filter((id) => id !== 'TECHNICAL OVERVIEW').map((id) => {
        const content = parsed[id as TechnicalFileSectionId]?.trim();
        if (!content) return null;
        const accent = sectionHeaderAccent(id);
        const isOpen = expanded[id] ?? false;
        return (
          <View key={id}>
            <CollapsibleSection
              id={id}
              title={id}
              expanded={isOpen}
              onToggle={() => toggle(id)}
              accent={accent}
            >
              {renderSectionBody(id, content)}
            </CollapsibleSection>
            <View style={styles.divider} />
          </View>
        );
      })}
    </View>
  );
}

function CollapsibleSection({
  id,
  title,
  expanded,
  onToggle,
  accent,
  children,
}: {
  id: string;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  accent?: string;
  children: ReactNode;
}) {
  const color = accent ?? Colors.accent;
  return (
    <View style={styles.sectionBlock}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.sectionHeaderPressable, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title} section`}
      >
        <Text style={[styles.sectionHeader, { color }]} allowFontScaling={false}>
          {title}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={color}
        />
      </Pressable>
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  sectionBlock: { paddingVertical: 4 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sectionHeader: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    flex: 1,
  },
  sectionBody: { paddingTop: 4 },
  contentText: {
    ...CONTENT_TEXT,
  },
  overviewProse: {
    ...CONTENT_TEXT,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  stageBlock: { marginBottom: 12 },
  stageLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
});
