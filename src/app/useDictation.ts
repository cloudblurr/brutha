"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice dictation via the browser Web Speech API (SpeechRecognition).
 *
 * Used for hands-free note-taking / message composition: the user taps the mic,
 * speaks, and the (interim + final) transcript is streamed back via onResult so
 * the caller can append it to the composer input.
 *
 * Degrades gracefully: when the browser has no SpeechRecognition (e.g. Firefox,
 * some iOS WebViews), `supported` is false and the UI hides the mic. No external
 * dependency and no network transcription service is required — recognition
 * runs in the browser.
 */

// Minimal typing for the non-standard SpeechRecognition API.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(opts: {
  onResult: (finalText: string) => void;
  onInterim?: (interimText: string) => void;
  lang?: string;
}) {
  const { onResult, onInterim, lang } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser.");
      return;
    }
    setError(null);
    const rec = new Ctor();
    rec.lang = lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) onResult(text);
        else interim += text;
      }
      if (interim && onInterim) onInterim(interim);
    };
    rec.onerror = (e: { error?: string }) => {
      const code = e.error ?? "unknown";
      // "no-speech" / "aborted" are benign; surface the rest.
      if (code !== "no-speech" && code !== "aborted") {
        setError(
          code === "not-allowed"
            ? "Microphone permission denied."
            : `Voice input error: ${code}`
        );
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [lang, onResult, onInterim]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
