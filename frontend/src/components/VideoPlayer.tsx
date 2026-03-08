import React, { useEffect, useRef, useState } from 'react';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';
import { useSocket } from '../context/SocketContext';
import { VideoState } from '../types';
import { Play, Pause } from 'lucide-react';

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
  const [duration, setDuration] = useState(0);
  const [sliderTime, setSliderTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const { syncPlay, syncPause, syncSeek, loadVideo, getCurrentTime, getDuration } = useYouTubePlayer({
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

  useEffect(() => {
    if (!videoState.videoId) {
      setDuration(0);
      setSliderTime(0);
      return;
    }

    const tick = () => {
      const nextDuration = getDuration();
      if (nextDuration > 0) {
        setDuration(nextDuration);
      }

      if (!isDragging) {
        setSliderTime(getCurrentTime());
      }
    };

    tick();
    const id = window.setInterval(tick, 300);
    return () => window.clearInterval(id);
  }, [videoState.videoId, isDragging, getCurrentTime, getDuration]);

  const formatTime = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handleSeekChange = (value: number) => {
    setSliderTime(value);
  };

  const commitSeek = () => {
    if (!canControl || !videoState.videoId) return;
    const nextTime = Math.max(0, Math.min(sliderTime, duration || sliderTime));
    emitSeek(nextTime);
    setIsDragging(false);
  };

  return (
    // Size is inherited from parent wrapper in RoomPage (h-[..vh], min-h, max-h).
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden group">
      {!videoState.videoId && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface text-slate-500 gap-3">
          <div className="text-6xl opacity-20">▶</div>
          <p className="font-body text-sm">No video loaded</p>
          {canControl && <p className="font-body text-xs opacity-60">Paste a YouTube URL above to get started</p>}
        </div>
      )}

      {/* Keep full size so iframe always fills whatever container height/width you set in RoomPage. */}
      <div id={PLAYER_ID} className="w-full h-full" />

      {/* Custom overlay controls */}
      {canControl && videoState.videoId && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent 
                        opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-3">
          <div className="flex items-center gap-3">
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
            <span className="font-mono text-xs text-white/80 min-w-[84px]">
              {formatTime(sliderTime)} / {formatTime(duration || videoState.currentTime)}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(duration, sliderTime, 1)}
            step={0.1}
            value={Math.min(sliderTime, Math.max(duration, sliderTime, 1))}
            onMouseDown={() => setIsDragging(true)}
            onTouchStart={() => setIsDragging(true)}
            onChange={(e) => handleSeekChange(Number(e.target.value))}
            onMouseUp={commitSeek}
            onTouchEnd={commitSeek}
            className="w-full h-1.5 accent-white cursor-pointer"
            aria-label="Seek video"
          />
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
