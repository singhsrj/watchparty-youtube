import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface UseYouTubePlayerOptions {
  containerId: string;
  videoId: string;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
}

export const useYouTubePlayer = ({
  containerId,
  videoId,
  onReady,
  onStateChange,
}: UseYouTubePlayerOptions) => {
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const suppressRef = useRef(false); // suppress events triggered by sync

  const initPlayer = useCallback(() => {
    if (!window.YT || playerRef.current) return;

    playerRef.current = new window.YT.Player(containerId, {
      height: '100%',
      width: '100%',
      videoId: videoId || '',
      playerVars: {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
      },
      events: {
        onReady: () => {
          readyRef.current = true;
          onReady?.();
        },
        onStateChange: (event: any) => {
          if (!suppressRef.current) {
            onStateChange?.(event.data);
          }
        },
      },
    });
  }, [containerId, videoId]);

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initPlayer();
      };
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        readyRef.current = false;
      }
    };
  }, []);

  const syncPlay = useCallback((time: number) => {
    if (!playerRef.current || !readyRef.current) return;
    suppressRef.current = true;
    playerRef.current.seekTo(time, true);
    playerRef.current.playVideo();
    setTimeout(() => { suppressRef.current = false; }, 500);
  }, []);

  const syncPause = useCallback((time: number) => {
    if (!playerRef.current || !readyRef.current) return;
    suppressRef.current = true;
    playerRef.current.seekTo(time, true);
    playerRef.current.pauseVideo();
    setTimeout(() => { suppressRef.current = false; }, 500);
  }, []);

  const syncSeek = useCallback((time: number) => {
    if (!playerRef.current || !readyRef.current) return;
    suppressRef.current = true;
    playerRef.current.seekTo(time, true);
    setTimeout(() => { suppressRef.current = false; }, 500);
  }, []);

  const loadVideo = useCallback((newVideoId: string) => {
    if (!playerRef.current || !readyRef.current) return;
    suppressRef.current = true;
    playerRef.current.loadVideoById(newVideoId);
    playerRef.current.pauseVideo();
    setTimeout(() => { suppressRef.current = false; }, 1000);
  }, []);

  const getCurrentTime = useCallback((): number => {
    if (!playerRef.current || !readyRef.current) return 0;
    return playerRef.current.getCurrentTime?.() ?? 0;
  }, []);

  const getPlayerState = useCallback((): number => {
    if (!playerRef.current || !readyRef.current) return -1;
    return playerRef.current.getPlayerState?.() ?? -1;
  }, []);

  return { syncPlay, syncPause, syncSeek, loadVideo, getCurrentTime, getPlayerState, playerRef, readyRef };
};
