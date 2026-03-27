import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

/** Site entry / CRT boot intro (SFX — uses global mute + SFX volume, not music). */
export const BOOT_INTRO_SFX_VIDEO_ID = 'tajDxBaPBBM';
/** Attenuation vs main SFX fader (startup jingle still needs to be clearly audible). */
const BOOT_INTRO_VOLUME_GAIN = 0.42;
export const BOOT_INTRO_SFX_VIDEO_URL = `https://www.youtube.com/watch?v=${BOOT_INTRO_SFX_VIDEO_ID}`;

/** Dispatch on first boot dismiss input so YouTube can start after autoplay policy (sync with user gesture). */
export const BOOT_INTRO_SFX_GESTURE_EVENT = 'detective-ml-boot-sfx-gesture';

const HiddenHost = styled.div`
  position: fixed;
  width: 1px;
  height: 1px;
  bottom: 0;
  right: 0;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: -1;
`;

interface YouTubeBootIntroSfxProps {
  enabled: boolean;
  /** 0–1 SFX fader; boot intro is played quieter than other SFX at the same setting */
  volume: number;
}

type YtPlayer = {
  destroy?: () => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  setVolume?: (n: number) => void;
  stopVideo?: () => void;
};

/**
 * One-shot(ish) hidden YouTube player for boot-screen intro atmosphere.
 * Pauses when `enabled` becomes false (e.g. user dismissed boot). Does not loop.
 */
const YouTubeBootIntroSfx: React.FC<YouTubeBootIntroSfxProps> = ({ enabled, volume }) => {
  const hostIdRef = useRef(`yt-boot-sfx-${Math.random().toString(36).slice(2, 11)}`);
  const playerRef = useRef<YtPlayer | null>(null);
  const volumeRef = useRef(volume);
  const enabledRef = useRef(enabled);
  volumeRef.current = volume;
  enabledRef.current = enabled;

  useEffect(() => {
    const w = window as Window & {
      YT?: { Player: new (id: string, opts: Record<string, unknown>) => unknown };
      onYouTubeIframeAPIReady?: () => void;
    };
    let destroyed = false;
    let creating = false;
    let pendingGesturePlay = false;

    const applyPlayback = () => {
      const p = playerRef.current;
      if (!p || destroyed) return;
      const v = Math.round(
        Math.max(0, Math.min(1, volumeRef.current * BOOT_INTRO_VOLUME_GAIN)) * 100
      );
      p.setVolume?.(v);
      if (enabledRef.current) {
        p.playVideo?.();
      } else {
        p.pauseVideo?.();
      }
    };

    const playFromUserGesture = () => {
      if (!enabledRef.current) return;
      const p = playerRef.current;
      if (!p || destroyed) return;
      p.setVolume?.(
        Math.round(Math.max(0, Math.min(1, volumeRef.current * BOOT_INTRO_VOLUME_GAIN)) * 100)
      );
      p.playVideo?.();
    };

    const onReady = (e: { target: YtPlayer }) => {
      creating = false;
      if (destroyed) return;
      playerRef.current = e.target;
      applyPlayback();
      if (pendingGesturePlay) {
        pendingGesturePlay = false;
        playFromUserGesture();
      }
    };

    const createPlayer = () => {
      if (destroyed || !w.YT?.Player || creating || playerRef.current) return;
      creating = true;
      try {
        new w.YT.Player(hostIdRef.current, {
          height: '1',
          width: '1',
          videoId: BOOT_INTRO_SFX_VIDEO_ID,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            loop: 0,
          },
          events: { onReady },
        });
      } catch {
        creating = false;
      }
    };

    if (w.YT?.Player) {
      createPlayer();
    } else {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        prev?.();
        createPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    const onGesture = () => {
      if (!enabledRef.current) return;
      if (!playerRef.current) {
        pendingGesturePlay = true;
        return;
      }
      playFromUserGesture();
    };
    window.addEventListener(BOOT_INTRO_SFX_GESTURE_EVENT, onGesture);

    return () => {
      window.removeEventListener(BOOT_INTRO_SFX_GESTURE_EVENT, onGesture);
      pendingGesturePlay = false;
      destroyed = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (enabled) {
      p.playVideo?.();
    } else {
      p.pauseVideo?.();
    }
  }, [enabled]);

  useEffect(() => {
    playerRef.current?.setVolume?.(
      Math.round(Math.max(0, Math.min(1, volume * BOOT_INTRO_VOLUME_GAIN)) * 100)
    );
  }, [volume]);

  return <HiddenHost id={hostIdRef.current} aria-hidden />;
};

export default YouTubeBootIntroSfx;
