
import React from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { ChatMessage } from '../../types';

// --- Styled Components ---

const ModalOverlay = styled.div`
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`;

const ChatModalContainer = styled.div`
  width: 600px;
  height: 500px;
  background: var(--color-officer-surface);
  border: 2px solid var(--color-officer-border);
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 30px var(--color-bg);
  @media (max-width: 768px) {
    width: 95%;
    height: 80%;
  }
`;

const ChatHeader = styled.div`
  background: #0d1b2a;
  color: #778da9;
  padding: var(--space) calc(var(--space) * 3);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--color-officer-border);
`;

const CloseButton = styled.button`
  background: transparent;
  color: var(--color-officer-text);
  border: none;
  ${type.bodyLg}
  cursor: pointer;
  &:hover { color: var(--color-text-bright); }
`;

const ChatLog = styled.div`
  flex: 1;
  padding: calc(var(--space) * 3);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: calc(var(--space) * 2);
`;

const OfficerBubble = styled.div<{ $sender: 'player' | 'officer' }>`
  align-self: ${props => props.$sender === 'player' ? 'flex-end' : 'flex-start'};
  max-width: 80%;
  background: ${props => props.$sender === 'player' ? 'var(--color-officer-button)' : 'var(--color-officer-bg)'};
  color: ${props => props.$sender === 'player' ? 'var(--color-officer-accent)' : 'var(--color-officer-text)'};
  padding: var(--space);
  border: 1px solid var(--color-officer-border);
  .name { ${type.small} margin-bottom: var(--space); opacity: 0.7; }
`;

const InputZone = styled.div`
  padding: calc(var(--space) * 2);
  border-top: 1px solid var(--color-officer-border);
  display: flex;
  gap: var(--space);
  background: var(--color-officer-bg);
`;

const ChatInputField = styled.input`
  flex: 1;
  background: var(--color-officer-surface);
  border: 1px solid var(--color-officer-border);
  color: var(--color-officer-accent);
  padding: var(--space);
  font-family: inherit;
  ${type.body}
  &:focus { outline: none; border-color: var(--color-officer-text); }
`;

const SendButton = styled.button`
  background: var(--color-officer-button-hover);
  color: var(--color-text-bright);
  border: none;
  padding: 0 20px;
  cursor: pointer;
  font-family: inherit;
  &:hover { background: #5a7ea8; }
  &:disabled { opacity: 0.5; }
`;

const ThinkingMessage = styled.div`
  color: #555;
  font-style: italic;
`;

const DisconnectedMessage = styled.div`
  color: #b00;
  text-align: center;
`;

// --- Props ---

interface OfficerChatModalProps {
  officerName: string;
  officerRole: string;
  officerHistory: ChatMessage[];
  officerHintsRemaining: number;
  isThinking: boolean;
  onSendMessage: (text: string) => void;
  onClose: () => void;
}

const OfficerChatModal: React.FC<OfficerChatModalProps> = ({
  officerName,
  officerRole,
  officerHistory,
  officerHintsRemaining,
  isThinking,
  onSendMessage,
  onClose,
}) => {
  const [inputVal, setInputVal] = React.useState('');
  const logRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [officerHistory]);

  const handleSend = () => {
    if (!inputVal.trim() || isThinking || officerHintsRemaining <= 0) return;
    onSendMessage(inputVal);
    setInputVal('');
  };

  return (
    <ModalOverlay>
      <ChatModalContainer>
        <ChatHeader>
          <span>SECURE LINE: {officerRole.toUpperCase()}</span>
          <CloseButton onClick={onClose}>[X]</CloseButton>
        </ChatHeader>
        <ChatLog ref={logRef}>
          {officerHistory.map((msg, i) => (
            <OfficerBubble key={i} $sender={msg.sender as 'player' | 'officer'}>
              <div className="name">{msg.sender === 'player' ? 'DETECTIVE' : officerName.toUpperCase()}</div>
              {msg.text}
            </OfficerBubble>
          ))}
          {isThinking && <ThinkingMessage>Incoming transmission...</ThinkingMessage>}
          {officerHintsRemaining <= 0 && <DisconnectedMessage>[CONNECTION LOST - BATTERY DEPLETED]</DisconnectedMessage>}
        </ChatLog>
        <InputZone>
          <ChatInputField
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={officerHintsRemaining > 0 ? "Ask for guidance..." : "Connection lost."}
            disabled={officerHintsRemaining <= 0 || isThinking}
          />
          <SendButton onClick={handleSend} disabled={officerHintsRemaining <= 0 || isThinking}>
            SEND
          </SendButton>
        </InputZone>
      </ChatModalContainer>
    </ModalOverlay>
  );
};

export default OfficerChatModal;
