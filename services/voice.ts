/**
 * OpenAI Realtime voice path — mirrors angel-app realtime (expo-audio PCM16 chunks,
 * Socket.IO realtime_* events, WAV merge + playback). No waveform / hold-to-speak UI.
 */

import * as FileSystemLegacy from 'expo-file-system/legacy';
import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

import { connectSocket, getSocket, subscribeSocketConnection } from './socket';

/** Deepest Realtime voice; sent on `realtime_start` for bruce_realtime_server.py. */
export const REALTIME_VOICE = 'onyx' as const;

export type RealtimeBriefRole = 'bruce' | 'tyler';

export type UseRealtimeVoiceOptions = {
  socketConnected: boolean;
  appendBriefingLine: (role: RealtimeBriefRole, text: string) => void;
  onRealtimeTranscript?: (evt: {
    role: RealtimeBriefRole;
    done: boolean;
    delta?: string;
    transcript?: string;
  }) => void;
  onRealtimeReady?: () => void;
  onRealtimeStartEmitted?: () => void;
};

/** expo-audio: 24 kHz mono PCM16 WAV for Realtime `realtime_audio_chunk` (SDK 55; same as angel-app). */
const REALTIME_RECORDING_OPTIONS = {
  isMeteringEnabled: false,
  extension: '.wav',
  sampleRate: 24000,
  numberOfChannels: 1,
  bitRate: 384000,
  android: {
    extension: '.wav',
    outputFormat: 'default' as const,
    audioEncoder: 'default' as const,
    sampleRate: 24000,
    numberOfChannels: 1,
  },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 24000,
    numberOfChannels: 1,
    bitRate: 384000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/wav', bitsPerSecond: 384000 },
};

/** Same capture settings as realtime; use for file-based voice notes (Whisper). */
export const VOICE_NOTE_RECORDING_OPTIONS = REALTIME_RECORDING_OPTIONS;

function uint8ArrayToBase64(u8: Uint8Array): string {
  return arrayBufferToBase64(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
}

function base64ToUint8Array(b64: string): Uint8Array {
  if (typeof atob === 'undefined') {
    throw new Error('base64 decode requires atob');
  }
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function extractNewPcmFromWavFile(fullBytes: Uint8Array, sentOffset: number) {
  const WAV_HEADER = 44;
  if (fullBytes.length <= WAV_HEADER) {
    return { chunk: new Uint8Array(0), nextOffset: 0 };
  }
  const pcm = fullBytes.slice(WAV_HEADER);
  if (sentOffset >= pcm.length) {
    return { chunk: new Uint8Array(0), nextOffset: sentOffset };
  }
  const chunk = pcm.slice(sentOffset);
  return { chunk, nextOffset: pcm.length };
}

function buildWavFromPcm16(pcmData: Uint8Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  w(36, 'data');
  view.setUint32(40, dataSize, true);
  const out = new Uint8Array(buffer);
  out.set(pcmData, 44);
  return out;
}

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  const key = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    base64 += key[a >> 2];
    base64 += key[((a & 3) << 4) | (b >> 4)];
    base64 += i + 1 < bytes.length ? key[((b & 15) << 2) | (c >> 6)] : '=';
    base64 += i + 2 < bytes.length ? key[c & 63] : '=';
  }
  return base64;
}

export function useRealtimeVoiceSession(options: UseRealtimeVoiceOptions) {
  const {
    socketConnected,
    appendBriefingLine,
    onRealtimeTranscript,
    onRealtimeReady,
    onRealtimeStartEmitted,
  } = options;

  const appendRef = useRef(appendBriefingLine);
  appendRef.current = appendBriefingLine;

  const transcriptRef = useRef(onRealtimeTranscript);
  transcriptRef.current = onRealtimeTranscript;

  const onReadyRef = useRef(onRealtimeReady);
  onReadyRef.current = onRealtimeReady;

  const onStartEmittedRef = useRef(onRealtimeStartEmitted);
  onStartEmittedRef.current = onRealtimeStartEmitted;

  const [sessionActive, setSessionActive] = useState(false);
  const [realtimeReady, setRealtimeReady] = useState(false);

  const pulseOpacity = useRef(new Animated.Value(1)).current;

  const voiceSessionActiveRef = useRef(false);
  const realtimeReadyRef = useRef(false);
  const realtimeChunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimePcmSentRef = useRef(0);
  const realtimeResponsePcmRef = useRef<string[]>([]);
  const realtimeResponsePlayerRef = useRef<ReturnType<typeof useAudioPlayer> | null>(null);
  const realtimeAudioRecorderRef = useRef<ReturnType<typeof useAudioRecorder> | null>(null);
  const realtimeAwaitingPlaybackFinalizeRef = useRef(false);
  const realtimePlaybackFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRealtimeResponseRef = useRef(false);
  const prevSessionActiveRef = useRef(false);

  const cleanupRealtimeRecordingRef = useRef<() => void>(() => {});
  const beginRealtimeStreamingRef = useRef<() => Promise<void>>(async () => {});
  const finalizeRealtimeResponsePlaybackRef = useRef<() => Promise<void>>(async () => {});
  const detachRealtimeListenersRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    voiceSessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    realtimeReadyRef.current = realtimeReady;
  }, [realtimeReady]);

  const realtimeResponsePlayer = useAudioPlayer(null);
  const realtimeResponseStatus = useAudioPlayerStatus(realtimeResponsePlayer);
  realtimeResponsePlayerRef.current = realtimeResponsePlayer;

  const realtimeAudioRecorder = useAudioRecorder(REALTIME_RECORDING_OPTIONS);
  realtimeAudioRecorderRef.current = realtimeAudioRecorder;

  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = null;
    if (!sessionActive) {
      pulseOpacity.stopAnimation();
      pulseOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      pulseLoopRef.current = null;
    };
  }, [sessionActive, pulseOpacity]);

  const cleanupRealtimeRecording = useCallback(() => {
    if (realtimeChunkIntervalRef.current) {
      clearInterval(realtimeChunkIntervalRef.current);
      realtimeChunkIntervalRef.current = null;
    }
    realtimePcmSentRef.current = 0;
    const rec = realtimeAudioRecorderRef.current;
    if (rec?.isRecording) {
      rec.stop().catch(() => {});
    }
  }, []);

  cleanupRealtimeRecordingRef.current = cleanupRealtimeRecording;

  const mergeRealtimePlayback = useCallback(async () => {
    try {
      cleanupRealtimeRecordingRef.current?.();
    } catch {
      /* ignore */
    }
    const chunks = realtimeResponsePcmRef.current;
    realtimeResponsePcmRef.current = [];
    if (!chunks.length) {
      if (voiceSessionActiveRef.current) {
        await beginRealtimeStreamingRef.current?.();
      }
      return;
    }
    const parts = chunks.map((c) => base64ToUint8Array(c));
    let total = 0;
    for (const p of parts) total += p.length;
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
      merged.set(p, offset);
      offset += p.length;
    }
    const wav = buildWavFromPcm16(merged, 24000);
    const uri =
      FileSystemLegacy.cacheDirectory + 'rt_play_' + Date.now() + '.wav';
    await FileSystemLegacy.writeAsStringAsync(uri, uint8ArrayToBase64(wav), {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });
    if (realtimePlaybackFallbackTimerRef.current) {
      clearTimeout(realtimePlaybackFallbackTimerRef.current);
      realtimePlaybackFallbackTimerRef.current = null;
    }

    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
    const player = realtimeResponsePlayerRef.current;
    if (!player) return;
    try {
      player.pause();
    } catch {
      /* ignore */
    }
    player.replace({ uri });
    realtimeAwaitingPlaybackFinalizeRef.current = true;
    wasPlayingRealtimeResponseRef.current = false;
    player.play();

    realtimePlaybackFallbackTimerRef.current = setTimeout(() => {
      realtimePlaybackFallbackTimerRef.current = null;
      if (!realtimeAwaitingPlaybackFinalizeRef.current) return;
      const p = realtimeResponsePlayerRef.current as { playing?: boolean } | null;
      if (p?.playing) return;
      console.warn('[realtime] playback did not start; resetting session for mic');
      void finalizeRealtimeResponsePlaybackRef.current?.();
    }, 1500);
  }, []);

  const finalizeRealtimeResponsePlayback = useCallback(async () => {
    if (realtimePlaybackFallbackTimerRef.current) {
      clearTimeout(realtimePlaybackFallbackTimerRef.current);
      realtimePlaybackFallbackTimerRef.current = null;
    }

    const hadAwaiting = realtimeAwaitingPlaybackFinalizeRef.current;
    realtimeAwaitingPlaybackFinalizeRef.current = false;
    if (!hadAwaiting) return;

    try {
      const player = realtimeResponsePlayerRef.current;
      try {
        player?.pause?.();
      } catch {
        /* ignore */
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
    } catch (e) {
      console.warn('[realtime] reset audio session after playback:', (e as Error)?.message ?? e);
    }

    await new Promise((r) => setTimeout(r, 100));

    if (!voiceSessionActiveRef.current) {
      return;
    }

    await beginRealtimeStreamingRef.current?.();
  }, []);

  finalizeRealtimeResponsePlaybackRef.current = finalizeRealtimeResponsePlayback;

  useEffect(() => {
    const s = realtimeResponseStatus;
    if (!s) return;

    if (s.playing) {
      wasPlayingRealtimeResponseRef.current = true;
      return;
    }

    const hadStarted = wasPlayingRealtimeResponseRef.current;
    const shouldFinalizeMic =
      voiceSessionActiveRef.current &&
      realtimeAwaitingPlaybackFinalizeRef.current &&
      (hadStarted || Boolean(s.didJustFinish));

    if (shouldFinalizeMic) {
      wasPlayingRealtimeResponseRef.current = false;
      void finalizeRealtimeResponsePlaybackRef.current?.().catch((e) =>
        console.warn('[realtime] finalize after playback:', (e as Error)?.message ?? e)
      );
      return;
    }

    if (!realtimeAwaitingPlaybackFinalizeRef.current) {
      wasPlayingRealtimeResponseRef.current = false;
    }
  }, [realtimeResponseStatus]);

  const beginRealtimeStreaming = useCallback(async () => {
    if (!voiceSessionActiveRef.current) return;
    if (!realtimeReadyRef.current || !getSocket()?.connected) return;

    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm?.granted) {
        getSocket()?.emit('realtime_stop');
        cleanupRealtimeRecordingRef.current?.();
        setRealtimeReady(false);
        setSessionActive(false);
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      if (!voiceSessionActiveRef.current) return;
      if (!realtimeReadyRef.current || !getSocket()?.connected) return;

      cleanupRealtimeRecordingRef.current?.();

      if (!voiceSessionActiveRef.current) return;

      await realtimeAudioRecorder.prepareToRecordAsync();
      if (!voiceSessionActiveRef.current) return;
      if (!realtimeReadyRef.current || !getSocket()?.connected) return;

      realtimeAudioRecorder.record();
      realtimePcmSentRef.current = 0;

      realtimeChunkIntervalRef.current = setInterval(async () => {
        const uri = realtimeAudioRecorderRef.current?.uri;
        if (!uri) return;
        try {
          const b64 = await FileSystemLegacy.readAsStringAsync(uri, {
            encoding: FileSystemLegacy.EncodingType.Base64,
          });
          const fullBytes = base64ToUint8Array(b64);
          const { chunk, nextOffset } = extractNewPcmFromWavFile(
            fullBytes,
            realtimePcmSentRef.current
          );
          realtimePcmSentRef.current = nextOffset;
          if (chunk.length > 0) {
            const pcmB64 = uint8ArrayToBase64(chunk);
            getSocket()?.emit('realtime_audio_chunk', { audio_b64: pcmB64 });
          }
        } catch (e) {
          console.warn('[realtime] chunk:', (e as Error)?.message ?? e);
        }
      }, 500);
    } catch (e) {
      console.warn('[realtime] begin streaming failed:', (e as Error)?.message ?? e);
    }
  }, [realtimeAudioRecorder]);

  beginRealtimeStreamingRef.current = beginRealtimeStreaming;

  const attachRealtimeListeners = useCallback(
    (socket: ReturnType<typeof getSocket>) => {
      if (!socket) return;
      if (detachRealtimeListenersRef.current) return;

      const onRealtimeReady = () => {
        setRealtimeReady(true);
        onReadyRef.current?.();
      };

      const onRealtimeAudioResponse = (payload: { audio_b64?: string }) => {
        const b64 = payload?.audio_b64;
        if (typeof b64 === 'string' && b64.length) {
          realtimeResponsePcmRef.current.push(b64);
        }
      };

      const onRealtimeAudioDone = () => {
        void mergeRealtimePlayback().catch((e) =>
          console.warn('[realtime] playback failed:', (e as Error)?.message ?? e)
        );
      };

      const onRealtimeTranscript = (p: {
        done?: boolean;
        transcript?: string;
        role?: string;
        delta?: string;
      }) => {
        if (!p) return;
        const role: RealtimeBriefRole = p.role === 'assistant' ? 'bruce' : 'tyler';
        const done = Boolean(p.done);
        const delta = p.delta != null ? String(p.delta) : '';
        const transcript = p.transcript != null ? String(p.transcript) : '';
        const handler = transcriptRef.current;
        handler?.({ role, done, delta, transcript });

        // Default behavior if consumer doesn't handle streaming.
        if (!handler) {
          if (done) {
            const text = transcript.trim();
            if (!text) return;
            appendRef.current(role, text);
          }
          return;
        }

        // Ensure Tyler's final transcript still lands even if handler is selective.
        if (role === 'tyler' && done) {
          const text = transcript.trim();
          if (text) appendRef.current('tyler', text);
        }
      };

      const onRealtimeError = (payload: { message?: string }) => {
        console.warn('[realtime] error', payload);
        try {
          cleanupRealtimeRecordingRef.current?.();
        } catch {
          /* ignore */
        }
        setRealtimeReady(false);
        setSessionActive(false);
      };

      const onRealtimeEnded = () => {
        setRealtimeReady(false);
        setSessionActive(false);
        try {
          cleanupRealtimeRecordingRef.current?.();
        } catch {
          /* ignore */
        }
      };

      socket.on('realtime_ready', onRealtimeReady);
      socket.on('realtime_audio_response', onRealtimeAudioResponse);
      socket.on('realtime_audio_done', onRealtimeAudioDone);
      socket.on('realtime_transcript', onRealtimeTranscript);
      socket.on('realtime_error', onRealtimeError);
      socket.on('realtime_ended', onRealtimeEnded);

      detachRealtimeListenersRef.current = () => {
        socket.off('realtime_ready', onRealtimeReady);
        socket.off('realtime_audio_response', onRealtimeAudioResponse);
        socket.off('realtime_audio_done', onRealtimeAudioDone);
        socket.off('realtime_transcript', onRealtimeTranscript);
        socket.off('realtime_error', onRealtimeError);
        socket.off('realtime_ended', onRealtimeEnded);
      };
    },
    [mergeRealtimePlayback]
  );

  useEffect(() => {
    const canStream =
      sessionActive && realtimeReady && socketConnected && Boolean(getSocket()?.connected);

    if (!canStream) {
      cleanupRealtimeRecording();
      return;
    }

    void beginRealtimeStreamingRef.current?.();

    return () => {
      cleanupRealtimeRecording();
    };
  }, [sessionActive, realtimeReady, socketConnected, cleanupRealtimeRecording]);

  useEffect(() => {
    const was = prevSessionActiveRef.current;
    const now = sessionActive;
    prevSessionActiveRef.current = now;

    if (!was && now) {
      const s = connectSocket();
      if (!s?.connected) {
        setSessionActive(false);
        return;
      }
      // IMPORTANT: attach listeners BEFORE emitting realtime_start (matches angel-app ordering).
      attachRealtimeListeners(s);
      setRealtimeReady(false);
      console.log('[realtime] emitting realtime_start', {
        socketId: s.id,
        connected: s.connected,
        voice: REALTIME_VOICE,
      });
      onStartEmittedRef.current?.();
      s.emit('realtime_start', { voice: REALTIME_VOICE });
    } else if (was && !now) {
      if (realtimePlaybackFallbackTimerRef.current) {
        clearTimeout(realtimePlaybackFallbackTimerRef.current);
        realtimePlaybackFallbackTimerRef.current = null;
      }
      realtimeAwaitingPlaybackFinalizeRef.current = false;
      try {
        realtimeResponsePlayerRef.current?.pause?.();
      } catch {
        /* ignore */
      }
      getSocket()?.emit('realtime_stop');
      cleanupRealtimeRecordingRef.current?.();
      setRealtimeReady(false);
    }
  }, [sessionActive]);

  useEffect(() => {
    return subscribeSocketConnection((c) => {
      if (!c && voiceSessionActiveRef.current) {
        if (realtimePlaybackFallbackTimerRef.current) {
          clearTimeout(realtimePlaybackFallbackTimerRef.current);
          realtimePlaybackFallbackTimerRef.current = null;
        }
        realtimeAwaitingPlaybackFinalizeRef.current = false;
        cleanupRealtimeRecordingRef.current?.();
        setRealtimeReady(false);
        setSessionActive(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!socketConnected) return;
    const socket = getSocket();
    if (!socket) return;
    attachRealtimeListeners(socket);
    return () => {
      if (realtimePlaybackFallbackTimerRef.current) {
        clearTimeout(realtimePlaybackFallbackTimerRef.current);
        realtimePlaybackFallbackTimerRef.current = null;
      }
      realtimeAwaitingPlaybackFinalizeRef.current = false;
      if (realtimeChunkIntervalRef.current) {
        clearInterval(realtimeChunkIntervalRef.current);
        realtimeChunkIntervalRef.current = null;
      }
      realtimePcmSentRef.current = 0;
      const rrec = realtimeAudioRecorderRef.current;
      if (rrec?.isRecording) {
        rrec.stop().catch(() => {});
      }
      detachRealtimeListenersRef.current?.();
      detachRealtimeListenersRef.current = null;
    };
  }, [socketConnected, attachRealtimeListeners]);

  const toggleVoiceSession = useCallback(() => {
    setSessionActive((prev) => {
      if (!prev) {
        if (!getSocket()?.connected) return false;
        return true;
      }
      return false;
    });
  }, []);

  return {
    voiceSessionLive: sessionActive,
    pulseOpacity,
    toggleVoiceSession,
  };
}
