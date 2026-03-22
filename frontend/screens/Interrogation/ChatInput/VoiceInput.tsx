
import React, { useState, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import toast from 'react-hot-toast';
import { hasNativeSpeechRecognition } from '../../../services/geminiSTT';

// --- Styled Components ---

const micPulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

const MicButton = styled.button<{ $listening: boolean; $transcribing?: boolean }>`
  background: ${props => props.$transcribing ? '#b86e00' : props.$listening ? '#f00' : '#222'};
  border: none;
  border-left: 1px solid #333;
  color: ${props => (props.$listening || props.$transcribing) ? '#fff' : '#666'};
  width: 50px;
  height: 100%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  ${props => props.$transcribing && `animation: ${micPulse} 1s ease-in-out infinite;`}
  
  &:hover {
    background: ${props => props.$transcribing ? '#a06000' : props.$listening ? '#d00' : '#333'};
    color: var(--color-text-bright);
  }
  
  svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
    filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
  }
`;

// --- SVG Icons ---

const MicIcon: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
  </svg>
);

const TranscribingIcon: React.FC = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
  </svg>
);

// --- Component ---

interface VoiceInputProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ inputVal, setInputVal, inputRef }) => {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recognitionRef = useRef<any>(null);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const startListening = () => {
    if (listening || transcribing) return;

    if (isIOS) {
      if (inputRef.current) inputRef.current.focus();
      toast('Tap the 🎙 on your keyboard for voice input', {
        duration: 5000,
        icon: '⌨️',
        position: 'bottom-center',
        style: { marginBottom: 'calc(var(--space) * 19)', marginLeft: 'auto', marginRight: 'auto', textAlign: 'center' },
      });
      return;
    }

    if (!hasNativeSpeechRecognition()) {
      if (!window.isSecureContext) {
        toast.error('Microphone requires HTTPS. Access via localhost or enable HTTPS.');
      } else {
        toast.error('Speech recognition is not supported in this browser.');
      }
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setListening(true);
      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      recognition.onerror = (e: any) => {
        setListening(false);
        recognitionRef.current = null;
      };
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInputVal(inputVal + (inputVal ? ' ' : '') + finalTranscript);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      toast.error('Speech recognition failed to start.');
    }
  };

  const toggleListening = () => {
    if (listening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) { }
      }
    } else {
      startListening();
    }
  };

  return (
    <MicButton
      $listening={listening}
      $transcribing={transcribing}
      onClick={toggleListening}
      title={transcribing ? 'Transcribing...' : listening ? 'Tap to stop' : 'Voice Input'}
    >
      {transcribing ? <TranscribingIcon /> : <MicIcon />}
    </MicButton>
  );
};

export default VoiceInput;
