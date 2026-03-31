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

function isInactiveCaseStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'closed' || s === 'terminated' || s === 'archived';
}

export default function ForensicScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');

  const [mode, setMode] = useState<Mode>('camera');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedB64, setCapturedB64] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState('');

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
    setBriefing('');
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
    setBriefing('');
    setFiled(false);
    setMode('camera');
  }, []);

  const onAnalyze = useCallback(async () => {
    if (!capturedB64 || loading) return;
    setLoading(true);
    setMode('analysis');
    setBriefing('');
    setFiled(false);
    const r = await analyzeForensicImage({
      image_base64: capturedB64,
      file_name: 'forensic.jpg',
      context: '',
    });
    const txt = r?.bruce_briefing?.trim() ?? '';
    setBriefing(txt);
    setLoading(false);
    setMode('result');
  }, [capturedB64, loading]);

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
        content: briefing,
        metadata: {
          image_base64: capturedB64,
          file_name: 'forensic.jpg',
        },
      });
      setAttachOpen(false);
      setFiled(ok);
    },
    [capturedB64, briefing]
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
            {capturedUri ? (
              <Image source={{ uri: capturedUri }} style={styles.preview} />
            ) : null}
            <View
              style={[
                styles.bottomBar,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <Pressable
                onPress={onRetake}
                style={({ pressed }) => [
                  styles.bottomBtn,
                  pressed && styles.bottomBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Retake"
              >
                <Text style={styles.bottomBtnMuted}>RETAKE</Text>
              </Pressable>

              <Pressable
                onPress={() => void onAnalyze()}
                style={({ pressed }) => [
                  styles.bottomBtn,
                  pressed && styles.bottomBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Analyze"
              >
                <Text style={styles.bottomBtnAccent}>ANALYZE</Text>
              </Pressable>
            </View>
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
              <Text style={styles.bruceText}>{briefing}</Text>
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
  resultContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  bruceText: {
    fontSize: 16,
    lineHeight: 26,
    letterSpacing: 0.3,
    color: Colors.textPrimary,
    textAlign: 'left',
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

