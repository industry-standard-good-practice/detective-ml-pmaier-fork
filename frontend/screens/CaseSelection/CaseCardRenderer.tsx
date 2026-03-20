
import React from 'react';
import { type } from '../../theme';
import styled from 'styled-components';
import { CaseData, CaseStats } from '../../types';

// --- Theme System ---

export type CardTheme = 'green' | 'cyan' | 'gold';

export const THEME_COLORS: Record<CardTheme, { border: string; bright: string; glow: string; badgeBg: string }> = {
  green: { border: '#0a0', bright: '#0f0', glow: 'rgba(0, 255, 0, 0.2)', badgeBg: '#031' },
  cyan: { border: '#0aa', bright: '#0ff', glow: 'rgba(0, 255, 255, 0.2)', badgeBg: '#044' },
  gold: { border: '#a80', bright: '#fc0', glow: 'rgba(255, 200, 0, 0.2)', badgeBg: '#442' },
};

const getTheme = (theme?: CardTheme) => THEME_COLORS[theme || 'cyan'];

// --- Styled Components ---

export const CaseCardContainer = styled.div<{ $theme?: CardTheme; $isActive?: boolean }>`
  border: 2px solid ${props => getTheme(props.$theme).border};
  padding: calc(var(--space) * 3);
  cursor: pointer;
  transition: all 0.2s;
  background: var(--color-surface-raised);
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 100%;

  @media (min-width: 769px) {
    &:hover {
      border-color: ${props => getTheme(props.$theme).bright};
      transform: translateY(-2px);
      box-shadow: 0 0 15px ${props => getTheme(props.$theme).glow};
    }
  }

  @media (max-width: 768px) {
    overflow: hidden;
    ${props => props.$isActive && `
      border-color: ${getTheme(props.$theme).bright};
      transform: translateY(-2px);
      box-shadow: 0 0 15px ${getTheme(props.$theme).glow};
    `}
    &:active {
      border-color: ${props => getTheme(props.$theme).bright};
      transform: translateY(-2px);
      box-shadow: 0 0 15px ${props => getTheme(props.$theme).glow};
    }
  }
`;

const CaseImage = styled.div<{ $src?: string }>`
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: calc(80vh - 200px);
  max-width: calc(80vh - 200px);
  background-color: #080808;
  background-image: ${props => props.$src && props.$src !== 'PLACEHOLDER' ? `url(${props.$src})` : 'none'};
  background-size: cover;
  background-position: center;
  border: 1px solid var(--color-border);
  image-rendering: pixelated;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-border);
  ${type.small}
  text-transform: uppercase;
  flex-shrink: 0;
`;

const CardTextContent = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px 0;

  @media (max-width: 768px) {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    min-height: 0;
    flex: 1;
    -webkit-overflow-scrolling: touch;
    margin-right: -20px;
    padding-right: calc(var(--space) * 3);
    padding-bottom: calc(var(--space) * 3);
    &::-webkit-scrollbar { width: 3px; }
    &::-webkit-scrollbar-thumb { background: var(--color-border); }
  }
`;

const CardTitle = styled.h3<{ $color: string }>`
  color: ${props => props.$color};
  ${type.h3}
  margin: 0 0 5px 0;
`;

const BadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space);
  margin-bottom: var(--space);
`;

const Badge = styled.span<{ $bg: string; $color: string }>`
  background: ${props => props.$bg};
  color: ${props => props.$color};
  padding: 0 var(--space);
  ${type.small}
  font-weight: bold;
  text-transform: uppercase;
`;

const TypeBadge = styled.span<{ $bg: string; $color: string }>`
  background: ${props => props.$bg};
  color: ${props => props.$color};
  padding: 0 var(--space);
  ${type.small}
`;

const DifficultyLabel = styled.span<{ $difficulty: string }>`
  color: ${props => props.$difficulty === 'Hard' ? 'red' : props.$difficulty === 'Medium' ? 'var(--color-accent-orange)' : 'green'};
  ${type.small}
`;

const VersionLabel = styled.span`
  color: var(--color-text-disabled);
  ${type.small}
`;

const AuthorLine = styled.div`
  color: var(--color-text-dim);
  ${type.small}
  margin-top: var(--space);
  font-style: italic;
`;

const Description = styled.p`
  color: var(--color-text-muted);
  margin: 5px 0 0 0;
  ${type.body}
  line-height: 1.4;
`;

const StatsLine = styled.div`
  display: flex;
  gap: calc(var(--space) * 2);
  align-items: center;
  margin-top: var(--space);
  ${type.small}
  color: var(--color-text-disabled);
`;

const UpvoteStat = styled.span`
  color: #0a0;
`;

const DownvoteStat = styled.span`
  color: #a00;
`;

export const AdminControls = styled.div`
  display: flex;
  gap: var(--space);
  margin-top: auto;
  padding-top: calc(var(--space) * 2);
  border-top: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
`;

export const AdminButton = styled.button<{ $variant?: 'delete' | 'feature' | 'publish' }>`
  background: ${props => props.$variant === 'delete' ? 'rgba(255, 0, 0, 0.1)' : props.$variant === 'publish' ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 255, 0, 0.1)'};
  border: 1px solid ${props => props.$variant === 'delete' ? '#f00' : props.$variant === 'publish' ? '#0f0' : '#ff0'};
  color: ${props => props.$variant === 'delete' ? '#f00' : props.$variant === 'publish' ? '#0f0' : '#ff0'};
  padding: var(--space) var(--space);
  font-family: inherit;
  ${type.xs}
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.2s;
  &:hover {
    background: ${props => props.$variant === 'delete' ? '#f00' : props.$variant === 'publish' ? '#0f0' : '#ff0'};
    color: #000;
  }
`;

// --- Props ---

interface CaseCardRendererProps {
  caseData: CaseData;
  theme: CardTheme;
  caseStats?: CaseStats;
  showFeaturedBadge?: boolean;
  extraBadges?: React.ReactNode;
  adminControls?: React.ReactNode;
  isActive?: boolean;
  onClick: () => void;
}

const CaseCardRenderer: React.FC<CaseCardRendererProps> = ({
  caseData: c,
  theme,
  caseStats: stats,
  showFeaturedBadge = false,
  extraBadges,
  adminControls,
  isActive,
  onClick,
}) => {
  const colors = THEME_COLORS[theme];

  return (
    <CaseCardContainer
      onClick={onClick}
      data-cursor="pointer"
      data-case-id={c.id}
      $isActive={isActive}
      $theme={theme}
    >
      <CaseImage $src={c.heroImageUrl || c.initialEvidence?.[0]?.imageUrl}>
        {!(c.heroImageUrl || c.initialEvidence?.[0]?.imageUrl) && "[ NO IMAGE ]"}
      </CaseImage>
      <CardTextContent>
        <CardTitle $color={colors.bright}>{c.title || "[ NO TITLE ]"}</CardTitle>
        <BadgeRow>
          {extraBadges}
          {showFeaturedBadge && c.isFeatured && (
            <Badge $bg={colors.bright} $color="#000">FEATURED</Badge>
          )}
          <TypeBadge $bg={colors.badgeBg} $color={colors.bright}>{c.type}</TypeBadge>
          <DifficultyLabel $difficulty={c.difficulty}>{c.difficulty}</DifficultyLabel>
          {c.version && <VersionLabel>v{c.version}</VersionLabel>}
        </BadgeRow>
        <AuthorLine>by {c.authorDisplayName || 'Unknown Author'}</AuthorLine>
        <Description>{c.description}</Description>
        {stats && stats.plays > 0 && (
          <StatsLine>
            <span>▶ {stats.plays} plays</span>
            <UpvoteStat>▲ {stats.upvotes || 0}</UpvoteStat>
            <DownvoteStat>▼ {stats.downvotes || 0}</DownvoteStat>
          </StatsLine>
        )}
      </CardTextContent>
      {adminControls}
    </CaseCardContainer>
  );
};

export default CaseCardRenderer;
