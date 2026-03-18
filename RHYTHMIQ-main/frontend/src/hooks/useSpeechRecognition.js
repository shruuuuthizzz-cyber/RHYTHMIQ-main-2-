import { useCallback, useEffect, useRef, useState } from 'react';

export function useSpeechRecognition({ lang = 'en-US', onResult } = {}) {
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        onResultRef.current?.(transcript);
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = (event) => {
      setError(event.error || 'voice_error');
      setListening(false);
    };

    recognitionRef.current = recognition;
    setSupported(true);

    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [lang]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      return false;
    }

    setError('');
    setListening(true);
    recognitionRef.current.start();
    return true;
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return {
    supported,
    listening,
    error,
    startListening,
    stopListening,
  };
}
