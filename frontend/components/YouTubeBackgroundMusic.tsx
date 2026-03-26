import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

/** Default background music (change if you swap the menu track). */
export const BACKGROUND_MUSIC_VIDEO_ID = 'BfLzTbn8uJU';
/** Watch URL for attribution / opening the track on YouTube. */
export const BACKGROUND_MUSIC_VIDEO_URL = `https://www.youtube.com/watch?v=${BACKGROUND_MUSIC_VIDEO_ID}`;
/** YouTube oEmbed `author_name` — update if you change the video. */
export const BACKGROUND_MUSIC_CHANNEL_NAME = 'Board Games & Game Night!';
/** Tooltip / accessible name for the attribution control. */
export const BACKGROUND_MUSIC_ATTRIBUTION_LABEL = `Thank you to ${BACKGROUND_MUSIC_CHANNEL_NAME} for the music currently playing`;

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

interface YouTubeBackgroundMusicProps {
  videoId?: string;
  enabled: boolean;
  /** 0–1, mapped to YouTube 0–100 */
  volume: number;
}

/**
 * Hidden YouTube iframe player for ambient BGM. Requires a user gesture (e.g. toggling music on)
 * before playback with sound per browser autoplay policy.
 */
const YouTubeBackgroundMusic: React.FC<YouTubeBackgroundMusicProps> = ({
  videoId = BACKGROUND_MUSIC_VIDEO_ID,
  enabled,
  volume,
}) => {
  const hostIdRef = useRef(`yt-bgm-${Math.random().toString(36).slice(2, 11)}`);
  const playerRef = useRef<{ destroy?: () => void; playVideo?: () => void; pauseVideo?: () => void; setVolume?: (n: number) => void } | null>(null);
  const volumeRef = useRef(volume);
  const enabledRef = useRef(enabled);
  volumeRef.current = volume;
  enabledRef.current = enabled;

  useEffect(() => {
    const w = window as Window & { YT?: { Player: new (id: string, opts: Record<string, unknown>) => unknown }; onYouTubeIframeAPIReady?: () => void };
    let destroyed = false;
    let creating = false;

    const applyPlayback = () => {
      const p = playerRef.current;
      if (!p || destroyed) return;
      const v = Math.round(Math.max(0, Math.min(1, volumeRef.current)) * 100);
      p.setVolume?.(v);
      if (enabledRef.current) {
        p.playVideo?.();
      } else {
        p.pauseVideo?.();
      }
    };

    const onReady = (e: { target: typeof playerRef.current }) => {
      creating = false;
      if (destroyed) return;
      playerRef.current = e.target;
      applyPlayback();
    };

    const createPlayer = () => {
      if (destroyed || !w.YT?.Player || creating || playerRef.current) return;
      creating = true;
      try {
        new w.YT.Player(hostIdRef.current, {
        height: '1',
        width: '1',
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          loop: 1,
          playlist: videoId,
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

    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, [videoId]);

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
    playerRef.current?.setVolume?.(Math.round(Math.max(0, Math.min(1, volume)) * 100));
  }, [volume]);

  return <HiddenHost id={hostIdRef.current} aria-hidden />;
};

export default YouTubeBackgroundMusic;
