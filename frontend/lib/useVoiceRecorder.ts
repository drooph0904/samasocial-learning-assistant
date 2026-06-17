"use client";
import { useEffect, useRef, useState } from "react";

import { transcribeAudio } from "./api";

/**
 * Microphone recording + transcription for the chat composer.
 * Records via MediaRecorder, uploads the clip to the backend (Whisper), and
 * hands the transcript to `onTranscript`. Gracefully no-ops where unsupported.
 */
export function useVoiceRecorder(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof window !== "undefined" &&
        "MediaRecorder" in window,
    );
  }, []);

  async function toggle() {
    setError("");
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) onTranscript(text);
        } catch {
          setError("Couldn't transcribe that — please try again.");
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone access was denied.");
    }
  }

  return { recording, transcribing, supported, error, toggle };
}
