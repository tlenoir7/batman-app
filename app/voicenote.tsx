import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import {
  fetchActiveCases,
  fileVoiceNote,
  transcribeVoiceNote,
  type CaseBoardRow,
} from '../services/api';
import { VOICE_NOTE_RECORDING_OPTIONS } from '../services/voice';

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isTerminatedStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'closed' || s === 'terminated' || s === 'archived';
}

type Phase = 'idle' | 'transcribing' | 'transcribed' | 'filing' | 'filed';

export default function VoiceNoteScreen() {
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(VOICE_NOTE_RECORDING_OPTIONS);
  const recState = useAudioRecorderState(recorder, 200);

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcription, setTranscription] = useState('');
  const [audioDurationSec, setAudioDurationSec] = useState(0);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [cases, setCases] = useState<CaseBoardRow[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!recState.isRecording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recState.isRecording, pulse]);

  const startRecording = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Voice note', 'Recording is not available on web.');
      return;
    }
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone', 'Permission is required to record.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (e) {
      Alert.alert('Recording', String((e as Error)?.message ?? e));
    }
  }, [recorder]);

  const runStopAndTranscribe = useCallback(async () => {
    if (!recState.isRecording) return;
    const status = recorder.getStatus();
    const durationSec = status.durationMillis / 1000;
    setAudioDurationSec(durationSec);
    try {
      await recorder.stop();
    } catch (e) {
      Alert.alert('Recording', String((e as Error)?.message ?? e));
      return;
    }
    const uri = recorder.uri;
    if (!uri) {
      Alert.alert('Voice note', 'Could not read recording.');
      return;
    }
    setPhase('transcribing');
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const text = await transcribeVoiceNote(b64, 'recording.wav');
      if (!text) {
        Alert.alert('Transcription', 'Could not transcribe audio.');
        setPhase('idle');
        return;
      }
      setTranscription(text);
      setPhase('transcribed');
    } catch (e) {
      Alert.alert('Transcription', String((e as Error)?.message ?? e));
      setPhase('idle');
    }
  }, [recorder, recState.isRecording]);

  const toggleRecord = useCallback(async () => {
    if (phase === 'transcribing' || phase === 'filing' || phase === 'filed') return;
    if (phase === 'transcribed') return;
    if (recState.isRecording) {
      await runStopAndTranscribe();
    } else {
      await startRecording();
    }
  }, [phase, recState.isRecording, runStopAndTranscribe, startRecording]);

  const discard = useCallback(async () => {
    if (recState.isRecording) {
      try {
        await recorder.stop();
      } catch {
        /* ignore */
      }
    }
    setTranscription('');
    setAudioDurationSec(0);
    setPhase('idle');
  }, [recorder, recState.isRecording]);

  const openCaseModal = useCallback(async () => {
    setCaseModalOpen(true);
    setCasesLoading(true);
    const rows = await fetchActiveCases();
    setCases(rows);
    setCasesLoading(false);
  }, []);

  const onPickCase = useCallback(
    async (c: CaseBoardRow) => {
      if (!transcription.trim()) return;
      setCaseModalOpen(false);
      setPhase('filing');
      const r = await fileVoiceNote(transcription.trim(), c.case_id, audioDurationSec);
      if (r.ok) {
        setPhase('filed');
        setTimeout(() => {
          router.back();
        }, 1500);
      } else {
        setPhase('transcribed');
        Alert.alert('Filing failed', 'Could not attach to case.');
      }
    },
    [transcription, audioDurationSec]
  );

  const recordDisabled =
    phase === 'transcribing' || phase === 'filing' || phase === 'filed' || phase === 'transcribed';

  const sortedCases = [...cases].sort((a, b) => {
    const ta = isTerminatedStatus(String(a.status || '')) ? 1 : 0;
    const tb = isTerminatedStatus(String(b.status || '')) ? 1 : 0;
    return ta - tb;
  });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.topLabel} allowFontScaling={false}>
            VOICE NOTE
          </Text>

          <View style={styles.centerCol}>
            <Animated.View style={{ opacity: recState.isRecording ? pulse : 1 }}>
              <Pressable
                onPress={() => void toggleRecord()}
                disabled={recordDisabled}
                style={({ pressed }) => [
                  styles.recordOuter,
                  recState.isRecording && styles.recordOuterRecording,
                  recordDisabled && styles.recordOuterDisabled,
                  pressed && !recordDisabled && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  recState.isRecording ? 'Stop recording' : 'Start recording'
                }
              >
                <Ionicons
                  name="mic-outline"
                  size={36}
                  color="#ffffff"
                />
              </Pressable>
            </Animated.View>
            {recState.isRecording ? (
              <Text style={styles.recordingHint} allowFontScaling={false}>
                RECORDING
              </Text>
            ) : null}
            {(phase === 'transcribing' ||
              phase === 'transcribed' ||
              phase === 'filing' ||
              phase === 'filed') ? (
              <Text style={styles.durationText} allowFontScaling={false}>
                {formatDuration(audioDurationSec)}
              </Text>
            ) : null}
            {phase === 'transcribing' ? (
              <Text style={styles.transcribing} allowFontScaling={false}>
                TRANSCRIBING...
              </Text>
            ) : null}
          </View>

          {phase === 'transcribed' || phase === 'filing' || phase === 'filed' ? (
            <Text style={styles.transcriptionText}>{transcription}</Text>
          ) : null}

          {phase === 'transcribed' ? (
            <Pressable
              onPress={() => void openCaseModal()}
              style={({ pressed }) => [styles.fileBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="File to case"
            >
              <Text style={styles.fileBtnText}>FILE TO CASE</Text>
            </Pressable>
          ) : null}

          {phase === 'filed' ? (
            <Text style={styles.filedText} allowFontScaling={false}>
              Filed.
            </Text>
          ) : null}

          {phase === 'transcribed' || phase === 'transcribing' ? (
            <Pressable
              onPress={() => void discard()}
              disabled={phase === 'transcribing'}
              style={({ pressed }) => [
                styles.discardBtn,
                phase === 'transcribing' && styles.discardDisabled,
                pressed && phase !== 'transcribing' && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Discard recording"
            >
              <Text style={styles.discardText}>DISCARD</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>CANCEL</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={caseModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCaseModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCaseModalOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Pressable
            style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 20) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle} allowFontScaling={false}>
              SELECT CASE
            </Text>
            {casesLoading ? (
              <Text style={styles.muted}>Loading…</Text>
            ) : (
              <ScrollView style={styles.modalScroll} nestedScrollEnabled>
                {sortedCases.length === 0 ? (
                  <Text style={styles.muted}>No cases.</Text>
                ) : (
                  sortedCases.map((c) => (
                    <Pressable
                      key={c.case_id}
                      onPress={() => void onPickCase(c)}
                      style={({ pressed }) => [styles.caseRow, pressed && styles.pressed]}
                    >
                      <Text style={styles.caseId}>{c.case_id}</Text>
                      <Text style={styles.caseTitle} numberOfLines={2}>
                        {c.title || 'Untitled'}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}
            <Pressable
              onPress={() => setCaseModalOpen(false)}
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
    backgroundColor: '#080808',
  },
  safe: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  topLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2d4a8a',
    marginBottom: 28,
  },
  centerCol: {
    alignItems: 'center',
    marginBottom: 24,
  },
  recordOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  recordOuterRecording: {
    borderColor: '#c0392b',
  },
  recordOuterDisabled: {
    opacity: 0.4,
  },
  pressed: { opacity: 0.75 },
  recordingHint: {
    marginTop: 10,
    fontSize: 11,
    letterSpacing: 1,
    color: '#6b7280',
  },
  durationText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  transcribing: {
    marginTop: 10,
    fontSize: 12,
    letterSpacing: 2,
    color: '#6b7280',
  },
  transcriptionText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#e8e8e8',
    marginBottom: 20,
  },
  fileBtn: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 8,
  },
  fileBtnText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#2d4a8a',
    fontWeight: '700',
  },
  filedText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  discardBtn: {
    alignSelf: 'flex-start',
    marginBottom: 24,
    paddingVertical: 8,
  },
  discardDisabled: {
    opacity: 0.35,
  },
  discardText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#6b7280',
    fontWeight: '600',
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#6b7280',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#080808',
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
    maxHeight: 360,
  },
  caseRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  caseId: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#2d4a8a',
    marginBottom: 4,
  },
  caseTitle: {
    fontSize: 14,
    color: '#e8e8e8',
  },
  muted: {
    fontSize: 14,
    color: '#6b7280',
  },
  modalClose: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  modalCloseText: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#2d4a8a',
    fontWeight: '700',
  },
});
