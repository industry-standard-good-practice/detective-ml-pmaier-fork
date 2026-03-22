
import React from 'react';
import styled from 'styled-components';
import { type } from '../../theme';
import { Suspect, Emotion } from '../../types';
import SuspectPortrait from '../../components/SuspectPortrait';

// --- Styled Components ---

const Header = styled.div`
  display: none;
  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    padding: 10px var(--screen-edge-horizontal);
    background: #111;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
    gap: calc(var(--space) * 2);
  }
`;

const NavBtn = styled.button`
  background: #222;
  color: #ccc;
  border: 1px solid #444;
  padding: var(--space) var(--space);
  font-family: inherit;
  ${type.body}
  cursor: pointer;
  &:hover { background: #333; }
`;

const ProfileBtn = styled.button`
  background: #333;
  color: #fff;
  border: 1px solid #666;
  padding: var(--space) var(--space);
  font-family: inherit;
  ${type.small}
  cursor: pointer;
`;

// --- Component ---

interface MobileSuspectHeaderProps {
  suspect: Suspect;
  emotion: Emotion;
  aggravationLevel: number;
  onShowProfile: () => void;
  onCycleSuspect: (direction: 'prev' | 'next') => void;
}

const MobileSuspectHeader: React.FC<MobileSuspectHeaderProps> = ({
  suspect,
  emotion,
  aggravationLevel,
  onShowProfile,
  onCycleSuspect,
}) => {
  return (
    <Header>
      <div onClick={onShowProfile} style={{ cursor: 'pointer', flexShrink: 0 }}>
        <SuspectPortrait
          suspect={suspect}
          emotion={emotion}
          aggravation={aggravationLevel}
          size={120}
          style={{ border: '1px solid #333' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0', flex: 1, minWidth: 0 }}>
        <div style={{ color: '#fff', fontSize: 'var(--type-h2)', fontWeight: 'bold' }}>{suspect.name}</div>
        {!suspect.isDeceased && <div style={{ fontSize: 'var(--type-small)', color: aggravationLevel > 50 ? 'red' : '#aaa' }}>ANGER: {aggravationLevel}%</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space)', alignItems: 'stretch', flexShrink: 0 }}>
        <ProfileBtn id="mobile-profile-button" onClick={onShowProfile} style={{ width: '100%', textAlign: 'center' }}>PROFILE</ProfileBtn>
        <div style={{ display: 'flex' }}>
          <NavBtn onClick={() => onCycleSuspect('prev')} style={{ borderRight: 'none', flex: 1 }}>&lt;</NavBtn>
          <NavBtn onClick={() => onCycleSuspect('next')} style={{ flex: 1 }}>&gt;</NavBtn>
        </div>
      </div>
    </Header>
  );
};

export default MobileSuspectHeader;
