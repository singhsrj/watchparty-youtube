import React, { useEffect, useRef } from 'react';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';
import { useSocket } from '../context/SocketContext';
import { VideoState } from '../types';
import { Play, Pause, SkipForward } from 'lucide-react';

interface VideoPlayerProps {
  videoState: VideoState;
  canControl: boolean;
}

const PLAYER_ID = 'youtube-player-container';

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoState, canControl }) => {
  const { emitPlay, emitPause, emitSeek } = useSocket();
  const prevVideoId = useRef<string>('');
  const prevIsPlaying = useRef<boolean>(false);
  const prevTime = useRef<number>(0);

  const { syncPlay, syncPause, syncSeek, loadVideo, getCurrentTime } = useYouTubePlayer({
    containerId: PLAYER_ID,
    videoId: videoState.videoId,
    onReady: () => {
      if (videoState.videoId) {
        if (videoState.isPlaying) {
          syncPlay(videoState.currentTime);
        } else {
          syncPause(videoState.currentTime);
        }
      }
    },
    onStateChange: () => {},
  });

  // React to incoming sync_state changes
  useEffect(() => {
    if (!videoState.videoId) return;

    const videoChanged = videoState.videoId !== prevVideoId.current;
    const playChanged = videoState.isPlaying !== prevIsPlaying.current;
    const seeked = Math.abs(videoState.currentTime - prevTime.current) > 2;

    if (videoChanged) {
      loadVideo(videoState.videoId);
      prevVideoId.current = videoState.videoId;
      prevIsPlaying.current = false;
      prevTime.current = 0;
      return;
    }

    if (videoState.isPlaying && (!prevIsPlaying.current || seeked)) {
      syncPlay(videoState.currentTime);
    } else if (!videoState.isPlaying && (prevIsPlaying.current || seeked)) {
      syncPause(videoState.currentTime);
    } else if (seeked) {
      syncSeek(videoState.currentTime);
    }

    prevIsPlaying.current = videoState.isPlaying;
    prevTime.current = videoState.currentTime;
  }, [videoState]);

  const handlePlay = () => {
    if (!canControl) return;
    emitPlay(getCurrentTime());
  };

  const handlePause = () => {
    if (!canControl) return;
    emitPause(getCurrentTime());
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden group">
      {!videoState.videoId && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface text-slate-500 gap-3">
          <div className="text-6xl opacity-20">▶</div>
          <p className="font-body text-sm">No video loaded</p>
          {canControl && <p className="font-body text-xs opacity-60">Paste a YouTube URL above to get started</p>}
        </div>
      )}

      <div id={PLAYER_ID} className="w-full h-full" />

      {/* Custom overlay controls */}
      {canControl && videoState.videoId && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent 
                        opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-3">
          {videoState.isPlaying ? (
            <button onClick={handlePause}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white">
              <Pause size={18} />
            </button>
          ) : (
            <button onClick={handlePlay}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white">
              <Play size={18} />
            </button>
          )}
          <span className="font-mono text-xs text-white/60">
            {videoState.isPlaying ? 'Playing' : 'Paused'}
          </span>
        </div>
      )}

      {/* Non-controller overlay to block direct YT controls */}
      {!canControl && videoState.videoId && (
        <div className="absolute inset-0 cursor-not-allowed" title="Only Host/Moderator can control playback" />
      )}
    </div>
  );
};

export default VideoPlayer;
