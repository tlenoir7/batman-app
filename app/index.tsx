import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
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

const TYPEWRITER_MS = 30;
const OPENING_DELAY_MS = 2000;

type BriefRow = {
  id: string;
  role: 'bruce' | 'tyler';
  text: string;
  visibleChars: number;
  useTypewriter: boolean;
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

  const firstConnectHandledRef = useRef(false);

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
        const id = makeId();
        setMessages((prev) => [
          {
            id,
            role: 'bruce',
            text,
            visibleChars: 0,
            useTypewriter: true,
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

  useEffect(() => {
    const row = messages.find(
      (m) => m.useTypewriter && m.visibleChars < m.text.length
    );
    if (!row) return;
    const handle = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === row.id
            ? { ...m, visibleChars: Math.min(m.text.length, m.visibleChars + 1) }
            : m
        )
      );
    }, TYPEWRITER_MS);
    return () => clearTimeout(handle);
  }, [messages]);

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

  const { voiceSessionLive, pulseOpacity, toggleVoiceSession } =
    useRealtimeVoiceSession({
      socketConnected: connected,
      appendBriefingLine,
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
    const reply = await postBriefingMessage({
      message: raw,
      first_contact: false,
    });
    if (reply) {
      const bruceId = makeId();
      setMessages((prev) => [
        {
          id: bruceId,
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
            <Text style={styles.headerLabel} allowFontScaling={false}>
              BATMAN-CONSCIOUSNESS
            </Text>
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => router.push('./caseboard')}
                style={({ pressed }) => [
                  styles.boardBtn,
                  pressed && styles.boardBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open case board"
              >
                <Ionicons
                  name="grid-outline"
                  size={20}
                  color={Colors.accent}
                />
              </Pressable>
              <Pressable
                onPress={() => router.push('./profiles')}
                style={({ pressed }) => [
                  styles.boardBtn,
                  pressed && styles.boardBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Open profiles board"
              >
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={Colors.accent}
                />
              </Pressable>
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
          </View>
        </View>

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
              const display =
                m.role === 'bruce' && m.useTypewriter
                  ? m.text.slice(0, m.visibleChars)
                  : m.text;
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
  headerLabel: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: Colors.accent,
    fontVariant: ['small-caps'],
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boardBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  boardBtnPressed: {
    opacity: 0.65,
  },
  statusWrap: {
    paddingLeft: 4,
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
