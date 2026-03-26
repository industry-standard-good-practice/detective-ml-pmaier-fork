import React, { useRef, useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';

/**
 * Horizontal scroll with the native bar hidden. Chrome 121+ applies scrollbar-color /
 * scrollbar-width over ::-webkit-scrollbar, so themed native bars are unreliable.
 * This uses a flat div track + thumb (matches case-review look: rectangles, no arrows).
 */
const Root = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
`;

const ScrollInner = styled.div`
  display: flex;
  gap: calc(var(--space) * 1.5);
  overflow-x: auto;
  padding: calc(var(--space) * 0.5) 0;
  cursor: none !important;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
`;

const Track = styled.div`
  position: relative;
  flex-shrink: 0;
  height: 8px;
  margin-top: 4px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  box-sizing: border-box;
  cursor: none !important;
`;

const Thumb = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  min-width: 24px;
  background: var(--color-border);
  border-radius: 0;
  cursor: none !important;
  touch-action: none;
  box-sizing: border-box;
  &:hover {
    background: var(--color-border-strong);
  }
`;

export interface HorizontalScrollStripProps {
  children: React.ReactNode;
  className?: string;
}

export const HorizontalScrollStrip: React.FC<HorizontalScrollStripProps> = ({ children, className }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbW, setThumbW] = useState(0);
  const [thumbLeft, setThumbLeft] = useState(0);
  const [showBar, setShowBar] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startScroll: number;
    maxScroll: number;
    maxThumbTravel: number;
  } | null>(null);

  const updateMetrics = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    if (scrollWidth <= clientWidth + 2) {
      setShowBar(false);
      return;
    }
    setShowBar(true);
    const tw = Math.max(Math.round((clientWidth / scrollWidth) * clientWidth), 24);
    const maxScroll = scrollWidth - clientWidth;
    const maxThumbTravel = Math.max(clientWidth - tw, 0);
    const tl = maxScroll <= 0 ? 0 : Math.round((scrollLeft / maxScroll) * maxThumbTravel);
    setThumbW(tw);
    setThumbLeft(tl);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateMetrics();
    const ro = new ResizeObserver(() => updateMetrics());
    ro.observe(el);
    el.addEventListener('scroll', updateMetrics, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', updateMetrics);
    };
  }, [updateMetrics, children]);

  const onThumbPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const maxThumbTravel = Math.max(el.clientWidth - thumbW, 0);
    dragRef.current = {
      startX: e.clientX,
      startScroll: el.scrollLeft,
      maxScroll,
      maxThumbTravel,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onThumbPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    if (d.maxThumbTravel <= 0) return;
    const next = d.startScroll + (dx / d.maxThumbTravel) * d.maxScroll;
    const maxS = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.max(0, Math.min(maxS, next));
  };

  const endThumbDrag = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (e.target !== trackRef.current) return;
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track || !showBar) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x >= thumbLeft && x <= thumbLeft + thumbW) return;
    const page = el.clientWidth;
    if (x < thumbLeft) {
      el.scrollBy({ left: -page, behavior: 'smooth' });
    } else {
      el.scrollBy({ left: page, behavior: 'smooth' });
    }
  };

  return (
    <Root className={className} data-cursor="default">
      <ScrollInner ref={scrollRef} data-cursor="default">
        {children}
      </ScrollInner>
      {showBar && (
        <Track ref={trackRef} data-cursor="default" onPointerDown={onTrackPointerDown}>
          <Thumb
            data-cursor="default"
            style={{ width: thumbW, transform: `translateX(${thumbLeft}px)` }}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={endThumbDrag}
            onPointerCancel={endThumbDrag}
          />
        </Track>
      )}
    </Root>
  );
};

export default HorizontalScrollStrip;
