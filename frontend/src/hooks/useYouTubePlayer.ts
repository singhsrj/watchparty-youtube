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

const YT_API_SCRIPT_ID = 'youtube-iframe-api-script';
let youtubeApiReadyPromise: Promise<void> | null = null;

const ensureYouTubeIframeApi = (): Promise<void> => {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (youtubeApiReadyPromise) {
    return youtubeApiReadyPromise;
  }

  youtubeApiReadyPromise = new Promise((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      resolve();
    };

    const existingScript =
      (document.getElementById(YT_API_SCRIPT_ID) as HTMLScriptElement | null) ||
      (document.querySelector('script[src*="youtube.com/iframe_api"]') as HTMLScriptElement | null);
    if (existingScript) {
      if (!existingScript.id) {
        existingScript.id = YT_API_SCRIPT_ID;
      }
      return;
    }

    const script = document.createElement('script');
    script.id = YT_API_SCRIPT_ID;
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      youtubeApiReadyPromise = null;
      reject(new Error('Failed to load YouTube IFrame API'));
    };

    document.head.appendChild(script);
  });

  return youtubeApiReadyPromise;
};

export const useYouTubePlayer = ({
  containerId,
  videoId,
  onReady,
  onStateChange,
}: UseYouTubePlayerOptions) => {
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const suppressRef = useRef(false); // suppress events triggered by sync
  const onReadyRef = useRef<UseYouTubePlayerOptions['onReady']>();
  const onStateChangeRef = useRef<UseYouTubePlayerOptions['onStateChange']>();

  useEffect(() => {
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
  }, [onReady, onStateChange]);

  const initPlayer = useCallback(() => {
    const container = document.getElementById(containerId);
    if (!window.YT?.Player || playerRef.current || !container) return;

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
          onReadyRef.current?.();
        },
        onStateChange: (event: any) => {
          if (!suppressRef.current) {
            onStateChangeRef.current?.(event.data);
          }
        },
      },
    });
  }, [containerId, videoId]);

  useEffect(() => {
    let active = true;

    ensureYouTubeIframeApi()
      .then(() => {
        if (!active) return;
        initPlayer();
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      active = false;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        readyRef.current = false;
      }
    };
  }, [initPlayer]);

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
    playerRef.current.playVideo();
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

  const getDuration = useCallback((): number => {
    if (!playerRef.current || !readyRef.current) return 0;
    return playerRef.current.getDuration?.() ?? 0;
  }, []);

  return {
    syncPlay,
    syncPause,
    syncSeek,
    loadVideo,
    getCurrentTime,
    getPlayerState,
    getDuration,
    playerRef,
    readyRef,
  };
};
