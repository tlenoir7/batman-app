import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '../constants/colors';
import { postBriefingMessage } from '../services/api';
import { getSocket, subscribeSocketConnection } from '../services/socket';
import { useRealtimeVoiceSession } from '../services/voice';

const OPENING_DELAY_MS = 2000;

type BriefRow = {
  id: string;
  role: 'bruce' | 'tyler';
  text: string;
  visibleChars: number;
  useTypewriter: boolean;
  showCursor?: boolean;
};

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function Index() {
  const insets = useSafeAreaInsets();
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<BriefRow[]>([]);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const firstConnectHandledRef = useRef(false);
  const streamingBruceIdRef = useRef<string | null>(null);
  const streamingBruceTextRef = useRef<string>('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribeSocketConnection((isConnected) => {
      setConnected(isConnected);
      if (!isConnected) return;
      if (firstConnectHandledRef.current) return;
      firstConnectHandledRef.current = true;
      timer = setTimeout(async () => {
        if (!getSocket()?.connected) return;
        const text = await postBriefingMessage({
          message: 'SYSTEM_INIT',
          first_contact: true,
        });
        if (!text) return;
        setMessages((prev) => [
          {
            id: makeId(),
            role: 'bruce',
            text,
            visibleChars: text.length,
            useTypewriter: false,
          },
          ...prev,
        ]);
      }, OPENING_DELAY_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Socket.IO streaming (mirror angel-app): angel_chunk appends; angel_reply_complete finalizes.
  useEffect(() => {
    if (!connected) return;
    const socket = getSocket();
    if (!socket) return;

    const onAngelChunk = (payload: unknown) => {
      const chunk =
        typeof payload === 'string'
          ? payload
          : (payload as { chunk?: unknown })?.chunk ?? '';
      const c = String(chunk || '');
      if (!c) return;

      if (!streamingBruceIdRef.current) {
        const id = makeId();
        streamingBruceIdRef.current = id;
        streamingBruceTextRef.current = c;
        setMessages((prev) => [
          {
            id,
            role: 'bruce',
            text: c,
            visibleChars: c.length,
            useTypewriter: false,
          },
          ...prev,
        ]);
        return;
      }

      streamingBruceTextRef.current += c;
      const id = streamingBruceIdRef.current;
      const nextText = streamingBruceTextRef.current;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                text: nextText,
                visibleChars: nextText.length,
                useTypewriter: false,
              }
            : m
        )
      );
    };

    const onAngelReplyComplete = (payload: unknown) => {
      const reply =
        typeof payload === 'string'
          ? payload
          : (payload as { reply?: unknown })?.reply ?? '';

      const hadStreaming = Boolean(streamingBruceIdRef.current);
      const streamed = streamingBruceTextRef.current || '';
      const finalText = hadStreaming && streamed ? streamed : String(reply || streamed || '');

      if (streamingBruceIdRef.current) {
        const id = streamingBruceIdRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  text: finalText,
                  visibleChars: finalText.length,
                  useTypewriter: false,
                }
              : m
          )
        );
      } else if (finalText.trim()) {
        setMessages((prev) => [
          {
            id: makeId(),
            role: 'bruce',
            text: finalText,
            visibleChars: finalText.length,
            useTypewriter: false,
          },
          ...prev,
        ]);
      }

      streamingBruceIdRef.current = null;
      streamingBruceTextRef.current = '';
    };

    const onAngelResponse = (payload: unknown) => {
      // Back-compat: final response without chunking.
      if (streamingBruceIdRef.current) return;
      const reply =
        typeof payload === 'string'
          ? payload
          : (payload as { reply?: unknown; text?: unknown; message?: unknown })?.reply ??
            (payload as { text?: unknown })?.text ??
            (payload as { message?: unknown })?.message ??
            '';
      const t = String(reply || '').trim();
      if (!t) return;
      setMessages((prev) => [
        {
          id: makeId(),
          role: 'bruce',
          text: t,
          visibleChars: t.length,
          useTypewriter: false,
        },
        ...prev,
      ]);
    };

    socket.on('angel_chunk', onAngelChunk);
    socket.on('angel_reply_complete', onAngelReplyComplete);
    socket.on('angel_response', onAngelResponse);
    return () => {
      socket.off('angel_chunk', onAngelChunk);
      socket.off('angel_reply_complete', onAngelReplyComplete);
      socket.off('angel_response', onAngelResponse);
    };
  }, [connected]);

  const appendBriefingLine = useCallback(
    (role: 'bruce' | 'tyler', text: string) => {
      const t = text.trim();
      if (!t) return;
      setMessages((prev) => [
        {
          id: makeId(),
          role,
          text: t,
          visibleChars: t.length,
          useTypewriter: false,
        },
        ...prev,
      ]);
    },
    []
  );

  const realtimeBruceIdRef = useRef<string | null>(null);
  const ensureRealtimeBruceRow = useCallback(() => {
    if (realtimeBruceIdRef.current) return realtimeBruceIdRef.current;
    const id = makeId();
    realtimeBruceIdRef.current = id;
    setMessages((prev) => [
      {
        id,
        role: 'bruce',
        text: '',
        visibleChars: 0,
        useTypewriter: false,
      },
      ...prev,
    ]);
    return id;
  }, []);

  const { voiceSessionLive, pulseOpacity, toggleVoiceSession } =
    useRealtimeVoiceSession({
      socketConnected: connected,
      appendBriefingLine,
      onRealtimeTranscript: (evt) => {
        if (evt.role === 'tyler') {
          if (evt.done && evt.transcript) {
            appendBriefingLine('tyler', evt.transcript);
          }
          return;
        }

        // Realtime transcript streaming (no typewriter): deltas append to same line.
        if (!evt.done) {
          if (!evt.delta) return;
          const id = ensureRealtimeBruceRow();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    text: m.text + String(evt.delta),
                    visibleChars: (m.text + String(evt.delta)).length,
                    useTypewriter: false,
                  }
                : m
            )
          );
          return;
        }
        const finalText = String(evt.transcript || '').trimEnd();
        const id = realtimeBruceIdRef.current ?? ensureRealtimeBruceRow();
        realtimeBruceIdRef.current = null;
        if (!finalText) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, text: finalText, visibleChars: finalText.length, useTypewriter: false }
              : m
          )
        );
      },
    });

  const onSend = useCallback(async () => {
    const raw = draft.trim();
    if (!raw || sending) return;
    setSending(true);
    const tylerId = makeId();
    setMessages((prev) => [
      {
        id: tylerId,
        role: 'tyler',
        text: raw,
        visibleChars: raw.length,
        useTypewriter: false,
      },
      ...prev,
    ]);
    setDraft('');
    const socket = getSocket();
    if (socket?.connected) {
      streamingBruceIdRef.current = null;
      streamingBruceTextRef.current = '';
      socket.emit('user_text', { message: raw });
      setSending(false);
      return;
    }

    const reply = await postBriefingMessage({ message: raw, first_contact: false });
    if (reply) {
      setMessages((prev) => [
        {
          id: makeId(),
          role: 'bruce',
          text: reply,
          visibleChars: reply.length,
          useTypewriter: false,
        },
        ...prev,
      ]);
    }
    setSending(false);
  }, [draft, sending]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.headerBar}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerLabel} allowFontScaling={false}>
                BATMAN-CONSCIOUSNESS
              </Text>
              <View style={styles.statusWrap}>
                {voiceSessionLive ? (
                  <Animated.View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: Colors.accent,
                        opacity: pulseOpacity,
                      },
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: connected
                          ? Colors.signalOnline
                          : Colors.alert,
                      },
                    ]}
                  />
                )}
              </View>
            </View>
            <Pressable
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [
                styles.menuBtn,
                pressed && styles.menuBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
            >
              <Ionicons
                name="ellipsis-vertical"
                size={22}
                color={Colors.accent}
              />
            </Pressable>
          </View>
        </View>

        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}
        >
          <View style={styles.menuModalRoot}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setMenuOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss menu"
            />
            <View style={styles.menuModalCenter} pointerEvents="box-none">
              <View style={styles.menuPanel} pointerEvents="auto">
                {(
                  [
                    { label: 'CASE BOARD', path: './caseboard' as const },
                    { label: 'PROFILES', path: './profiles' as const },
                    { label: 'ARSENAL', path: './arsenal' as const },
                    { label: 'CONTINGENCIES', path: './contingencies' as const },
                    { label: 'FORENSIC', path: './forensic' as const },
                    { label: 'VOICE NOTE', path: './voicenote' as const },
                  ] as const
                ).map((item, i, arr) => (
                  <Pressable
                    key={item.path}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push(item.path);
                    }}
                    style={({ pressed }) => [
                      styles.menuItem,
                      i < arr.length - 1 && styles.menuItemDivider,
                      pressed && styles.menuItemPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <Text style={styles.menuItemText}>{item.label}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setMenuOpen(false)}
                  style={({ pressed }) => [
                    styles.menuCancel,
                    pressed && styles.menuItemPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.menuCancelText}>CANCEL</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {messages.map((m) => {
              const display = m.text;
              return (
                <Text
                  key={m.id}
                  style={
                    m.role === 'bruce' ? styles.textBruce : styles.textTyler
                  }
                >
                  {display}
                </Text>
              );
            })}
          </ScrollView>

          <View
            style={[
              styles.inputDock,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            <Pressable
              onPress={toggleVoiceSession}
              disabled={!connected}
              style={({ pressed }) => [
                styles.micBtn,
                pressed && styles.micBtnPressed,
                !connected && styles.micBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                voiceSessionLive
                  ? 'End realtime voice session'
                  : 'Start realtime voice session'
              }
            >
              <Ionicons
                name={voiceSessionLive ? 'mic' : 'mic-outline'}
                size={22}
                color={
                  voiceSessionLive ? Colors.accent : Colors.textSecondary
                }
              />
            </Pressable>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Report."
              placeholderTextColor={Colors.textSecondary}
              editable={!sending}
              returnKeyType="send"
              onSubmitEditing={() => void onSend()}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={() => void onSend()}
              disabled={sending || !draft.trim()}
              style={({ pressed }) => [
                styles.sendBtn,
                pressed && styles.sendBtnPressed,
                (sending || !draft.trim()) && styles.sendBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send report"
            >
              <Ionicons name="arrow-forward" size={22} color={Colors.accent} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  headerBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.primary,
    backgroundColor: Colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  headerLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontVariant: ['small-caps'],
    flexShrink: 1,
  },
  menuBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnPressed: {
    opacity: 0.65,
  },
  statusWrap: {
    marginLeft: 10,
  },
  menuModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  menuModalCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: 24,
  },
  menuPanel: {
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuItem: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  menuItemPressed: {
    opacity: 0.75,
  },
  menuItemText: {
    fontSize: 16,
    color: Colors.textPrimary,
  },
  menuCancel: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  menuCancelText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  textBruce: {
    fontSize: 16,
    lineHeight: 26,
    letterSpacing: 0.3,
    color: Colors.textPrimary,
    textAlign: 'left',
    marginBottom: 18,
  },
  textTyler: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.textSecondary,
    textAlign: 'left',
    marginBottom: 14,
  },
  inputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    backgroundColor: Colors.inputBackground,
    color: Colors.textPrimary,
    fontSize: 16,
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnPressed: {
    opacity: 0.7,
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  micBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnPressed: {
    opacity: 0.7,
  },
  micBtnDisabled: {
    opacity: 0.35,
  },
});
