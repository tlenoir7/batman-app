import { Ionicons } from '@expo/vector-icons';
import { CameraView, type FlashMode, useCameraPermissions } from 'expo-camera';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import {
  analyzeForensicImage,
  attachToCase,
  fetchActiveCases,
  type CaseBoardRow,
} from '../services/api';

type Mode = 'camera' | 'preview' | 'analysis' | 'result';
type AnalysisMode = 'scan' | 'full';

type ForensicParsed = {
  type: string;
  confidence: string;
  mission: string;
  summary: string;
  keyFindings: string[];
  anomalies: string[];
  recommendedAction: string;
  bruceRead: string;
};

function isInactiveCaseStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'closed' || s === 'terminated' || s === 'archived';
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => asString(x)).filter((s) => s.trim());
  return [];
}

function parseForensicResponse(payload: {
  result?: unknown;
  bruce_briefing?: string;
}): ForensicParsed {
  const r = payload.result;
  const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
  const classification = o.classification;
  const cls =
    classification && typeof classification === 'object'
      ? (classification as Record<string, unknown>)
      : {};

  return {
    type: asString(cls.primary_type || o.primary_type || '').trim() || '—',
    confidence: asString(o.confidence || '').trim() || '—',
    mission: asString(o.mission_relevance || '').trim() || '—',
    summary: asString(o.summary || '').trim() || '—',
    keyFindings: asStringList(o.key_findings),
    anomalies: asStringList(o.anomalies),
    bruceRead: asString(payload.bruce_briefing || '').trim() || '—',
    recommendedAction: asString(o.recommended_action || '').trim() || '—',
  };
}

export default function ForensicScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');

  const [mode, setMode] = useState<Mode>('camera');
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('full');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedB64, setCapturedB64] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [contextText, setContextText] = useState('');
  const [report, setReport] = useState<ForensicParsed | null>(null);

  const [filed, setFiled] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [cases, setCases] = useState<CaseBoardRow[]>([]);

  const canUseCamera = Boolean(permission?.granted);

  const loadCases = useCallback(async () => {
    const rows = await fetchActiveCases();
    setCases(rows.filter((c) => !isInactiveCaseStatus(String(c.status || ''))));
  }, []);

  const flashIcon = useMemo(() => (flash === 'on' ? 'flash' : 'flash-off'), [flash]);

  const onCancel = useCallback(() => {
    setMode('camera');
    setCapturedUri(null);
    setCapturedB64(null);
    setContextText('');
    setReport(null);
    setFiled(false);
    setAttachOpen(false);
  }, []);

  const onCapture = useCallback(async () => {
    if (!cameraRef.current || loading) return;
    setFiled(false);
    const pic = await cameraRef.current.takePictureAsync({
      quality: 0.85,
      base64: true,
      exif: false,
    });
    if (!pic?.uri || !pic.base64) return;
    setCapturedUri(pic.uri);
    setCapturedB64(pic.base64);
    setMode('preview');
  }, [loading]);

  const onRetake = useCallback(() => {
    setCapturedUri(null);
    setCapturedB64(null);
    setContextText('');
    setReport(null);
    setFiled(false);
    setMode('camera');
  }, []);

  const onAnalyze = useCallback(async () => {
    if (!capturedB64 || loading) return;
    setLoading(true);
    setMode('analysis');
    setReport(null);
    setFiled(false);
    const r = await analyzeForensicImage({
      image_base64: capturedB64,
      file_name: 'forensic.jpg',
      context:
        analysisMode === 'scan'
          ? `SCAN\n\n${contextText || ''}`.trim()
          : `FULL ANALYSIS\n\n${contextText || ''}`.trim(),
    });
    const parsed = parseForensicResponse({
      result: r?.result,
      bruce_briefing: r?.bruce_briefing,
    });
    setReport(parsed);
    setLoading(false);
    setMode('result');
  }, [capturedB64, loading, analysisMode, contextText]);

  const openAttach = useCallback(async () => {
    await loadCases();
    setAttachOpen(true);
  }, [loadCases]);

  const attach = useCallback(
    async (row: CaseBoardRow) => {
      if (!capturedB64) return;
      const ok = await attachToCase({
        case_id: row.case_id,
        attachment_type: 'forensic_image',
        content: report?.bruceRead || '',
        metadata: {
          image_base64: capturedB64,
          file_name: 'forensic.jpg',
          analysis_mode: analysisMode,
          report: report ?? null,
        },
      });
      setAttachOpen(false);
      setFiled(ok);
    },
    [capturedB64, report, analysisMode]
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {!canUseCamera ? (
          <View style={styles.permissionWrap}>
            <Text style={styles.permissionText}>Camera permission required.</Text>
            <Pressable
              onPress={() => void requestPermission()}
              style={({ pressed }) => [
                styles.permissionBtn,
                pressed && styles.permissionBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Grant camera permission"
            >
              <Text style={styles.permissionBtnText}>GRANT</Text>
            </Pressable>
          </View>
        ) : mode === 'camera' ? (
          <View style={styles.flex}>
            <CameraView
              ref={(r) => {
                cameraRef.current = r;
              }}
              style={styles.camera}
              facing="back"
              flash={flash}
            />
            <View
              style={[
                styles.bottomBar,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.bottomBtn,
                  pressed && styles.bottomBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.bottomBtnMuted}>CANCEL</Text>
              </Pressable>

              <Pressable
                onPress={() => void onCapture()}
                style={({ pressed }) => [
                  styles.captureOuter,
                  pressed && styles.bottomBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Capture"
              >
                <View style={styles.captureInner} />
              </Pressable>

              <Pressable
                onPress={() => setFlash((p) => (p === 'on' ? 'off' : 'on'))}
                style={({ pressed }) => [
                  styles.bottomBtn,
                  pressed && styles.bottomBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Toggle flash"
              >
                <Ionicons name={flashIcon} size={22} color={Colors.accent} />
              </Pressable>
            </View>
          </View>
        ) : mode === 'preview' ? (
          <View style={styles.flex}>
            <ScrollView
              contentContainerStyle={styles.captureContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.captureCard}>
                {capturedUri ? (
                  <Image source={{ uri: capturedUri }} style={styles.previewCentered} />
                ) : null}

                <TextInput
                  style={styles.contextInput}
                  value={contextText}
                  onChangeText={setContextText}
                  placeholder="Context…"
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                />

                <View style={styles.modeRow}>
                  <Pressable
                    onPress={() => setAnalysisMode('scan')}
                    style={({ pressed }) => [
                      styles.modeBtn,
                      analysisMode === 'scan' && styles.modeBtnActive,
                      pressed && styles.bottomBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Scan mode"
                  >
                    <Text
                      style={[
                        styles.modeText,
                        analysisMode === 'scan' && styles.modeTextActive,
                      ]}
                    >
                      SCAN
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setAnalysisMode('full')}
                    style={({ pressed }) => [
                      styles.modeBtn,
                      analysisMode === 'full' && styles.modeBtnActive,
                      pressed && styles.bottomBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Full analysis mode"
                  >
                    <Text
                      style={[
                        styles.modeText,
                        analysisMode === 'full' && styles.modeTextActive,
                      ]}
                    >
                      FULL ANALYSIS
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => void onAnalyze()}
                  style={({ pressed }) => [
                    styles.analyzeBtn,
                    pressed && styles.bottomBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Analyze"
                >
                  <Text style={styles.analyzeBtnText}>ANALYZE</Text>
                </Pressable>

                <Pressable
                  onPress={onRetake}
                  style={({ pressed }) => [
                    styles.retakeBtn,
                    pressed && styles.bottomBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Retake"
                >
                  <Text style={styles.bottomBtnMuted}>RETAKE</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        ) : mode === 'analysis' ? (
          <View style={styles.centerWrap}>
            <Text style={styles.centerMuted}>Analyzing...</Text>
          </View>
        ) : (
          <View style={styles.flex}>
            <ScrollView
              contentContainerStyle={styles.resultContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.reportHeader}>
                <Text style={styles.reportTitle} allowFontScaling={false}>
                  FORENSIC REPORT
                </Text>
                <Text style={styles.metaLine}>
                  <Text style={styles.metaLabel}>TYPE</Text>
                  <Text style={styles.metaValue}> {report?.type ?? '—'}</Text>
                </Text>
                <Text style={styles.metaLine}>
                  <Text style={styles.metaLabel}>CONFIDENCE</Text>
                  <Text style={styles.metaValue}> {report?.confidence ?? '—'}</Text>
                </Text>
                <Text style={styles.metaLine}>
                  <Text style={styles.metaLabel}>MISSION</Text>
                  <Text style={styles.metaValue}> {report?.mission ?? '—'}</Text>
                </Text>
              </View>

              <Text style={styles.summaryPara}>{report?.summary ?? '—'}</Text>

              <Text style={styles.sectionMuted} allowFontScaling={false}>
                KEY FINDINGS
              </Text>
              {(report?.keyFindings?.length ? report.keyFindings : ['—']).map((f, idx) => (
                <Text key={`kf-${idx}`} style={styles.finding}>
                  • {f}
                </Text>
              ))}

              {report?.anomalies?.length ? (
                <>
                  <Text style={styles.sectionAlert} allowFontScaling={false}>
                    ANOMALIES
                  </Text>
                  {report.anomalies.map((a, idx) => (
                    <Text key={`an-${idx}`} style={styles.anomaly}>
                      ⚠ {a}
                    </Text>
                  ))}
                </>
              ) : null}

              <Text style={styles.sectionAccent} allowFontScaling={false}>
                BRUCE'S READ
              </Text>
              <Text style={styles.bruceRead}>{report?.bruceRead ?? '—'}</Text>

              <Text style={styles.recommendedAction}>
                {report?.recommendedAction ?? '—'}
              </Text>

              {filed ? <Text style={styles.filedText}>Filed.</Text> : null}
            </ScrollView>
            <View
              style={[
                styles.resultActions,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <Pressable
                onPress={() => void openAttach()}
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && styles.bottomBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Attach to case"
              >
                <Text style={styles.bottomBtnAccent}>ATTACH TO CASE</Text>
              </Pressable>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && styles.bottomBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.bottomBtnMuted}>DONE</Text>
              </Pressable>
            </View>
          </View>
        )}

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
              <ScrollView
                contentContainerStyle={styles.modalList}
                showsVerticalScrollIndicator={false}
              >
                {cases.length === 0 ? (
                  <Text style={styles.modalEmpty}>No active cases.</Text>
                ) : (
                  cases.map((c, i) => (
                    <Pressable
                      key={`${c.case_id}-${i}`}
                      onPress={() => void attach(c)}
                      style={({ pressed }) => [
                        styles.modalRow,
                        pressed && styles.modalRowPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Attach to ${c.case_id}`}
                    >
                      <Text style={styles.modalCaseId} allowFontScaling={false}>
                        {c.case_id}
                      </Text>
                      <Text style={styles.modalCaseTitle} numberOfLines={1}>
                        {c.title}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
              <Pressable
                onPress={() => setAttachOpen(false)}
                style={({ pressed }) => [
                  styles.modalClose,
                  pressed && styles.bottomBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.bottomBtnMuted}>CLOSE</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  camera: { flex: 1, backgroundColor: Colors.background },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  bottomBtn: {
    width: 80,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBtnPressed: { opacity: 0.7 },
  bottomBtnMuted: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  bottomBtnAccent: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },
  captureOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ffffff',
  },
  preview: { flex: 1, resizeMode: 'cover', backgroundColor: Colors.background },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerMuted: { fontSize: 14, color: Colors.textSecondary },
  captureContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    justifyContent: 'center',
  },
  captureCard: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    padding: 16,
    backgroundColor: Colors.background,
  },
  previewCentered: {
    width: '100%',
    height: 320,
    resizeMode: 'contain',
    backgroundColor: Colors.background,
    marginBottom: 12,
  },
  contextInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    backgroundColor: Colors.inputBackground,
    color: Colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    borderColor: Colors.accent,
  },
  modeText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  modeTextActive: {
    color: Colors.accent,
    fontWeight: '700',
  },
  analyzeBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.accent,
    marginBottom: 10,
  },
  analyzeBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },
  retakeBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  resultContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  reportHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingBottom: 12,
    marginBottom: 14,
  },
  reportTitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 10,
  },
  metaLine: { fontSize: 12, marginBottom: 4 },
  metaLabel: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
  },
  metaValue: { fontSize: 12, color: Colors.textPrimary },
  summaryPara: { fontSize: 15, color: Colors.textPrimary, lineHeight: 24, marginBottom: 16 },
  sectionMuted: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginTop: 6,
    marginBottom: 10,
  },
  finding: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22, marginBottom: 6 },
  sectionAlert: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.alert,
    marginTop: 14,
    marginBottom: 10,
  },
  anomaly: { fontSize: 14, color: Colors.alert, lineHeight: 22, marginBottom: 6 },
  sectionAccent: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 10,
  },
  bruceRead: {
    fontSize: 15,
    color: Colors.textPrimary,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  recommendedAction: {
    marginTop: 16,
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  filedText: { marginTop: 14, fontSize: 14, color: Colors.textSecondary },
  resultActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  actionBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  permissionText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  permissionBtn: {
    borderWidth: 1,
    borderColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  permissionBtnPressed: { opacity: 0.75 },
  permissionBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontWeight: '700',
  },
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
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 12,
  },
  modalList: { paddingBottom: 10 },
  modalEmpty: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  modalRow: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  modalRowPressed: { opacity: 0.7 },
  modalCaseId: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    marginBottom: 6,
  },
  modalCaseTitle: { fontSize: 14, color: Colors.textPrimary },
  modalClose: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});

