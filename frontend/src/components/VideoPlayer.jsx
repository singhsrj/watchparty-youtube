import React, { useEffect, useRef, useState } from 'react'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useSocket } from '../context/SocketContext'
import { Play, Pause, Volume2, VolumeX, Captions, Maximize, Minimize } from 'lucide-react'

const PLAYER_ID = 'youtube-player-container'
const VOLUME_STORAGE_KEY = 'watchparty:local-volume'
const CAPTIONS_STORAGE_KEY = 'watchparty:captions-enabled'
const DEFAULT_VOLUME = 60

const getInitialLocalVolume = () => {
  const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY)
  const parsed = raw ? Number(raw) : Number.NaN
  if (Number.isNaN(parsed)) return DEFAULT_VOLUME
  return Math.max(0, Math.min(100, Math.floor(parsed)))
}

const getInitialCaptionsEnabled = () => {
  return window.localStorage.getItem(CAPTIONS_STORAGE_KEY) === '1'
}

const VideoPlayer = ({ videoState, canControl }) => {
  const { emitPlay, emitPause, emitSeek, emitVideoEnded } = useSocket()
  const containerRef = useRef(null)
  const prevVideoId = useRef('')
  const initialVolumeRef = useRef(getInitialLocalVolume())
  const volumeInitializedRef = useRef(false)
  const [duration, setDuration] = useState(0)
  const [sliderTime, setSliderTime] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [volume, setVolumeState] = useState(initialVolumeRef.current)
  const [muted, setMuted] = useState(false)
  const [playerState, setPlayerState] = useState(-1)
  const endHandledRef = useRef(false)
  const [captionsEnabled, setCaptionsEnabledState] = useState(getInitialCaptionsEnabled)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const {
    syncPlay,
    syncPause,
    loadVideo,
    getCurrentTime,
    getDuration,
    getPlayerState,
    getVolume,
    isMuted,
    setVolume,
    toggleMute,
    setCaptionsEnabled,
    readyRef,
  } = useYouTubePlayer({
    containerId: PLAYER_ID,
    videoId: videoState.videoId,
    onReady: () => {
      setCaptionsEnabled(captionsEnabled)
      if (videoState.videoId) {
        if (videoState.isPlaying) {
          syncPlay(videoState.currentTime)
        } else {
          syncPause(videoState.currentTime)
        }
      }
    },
    onStateChange: (state) => setPlayerState(state),
  })

  useEffect(() => {
    if (!videoState.videoId) return

    const videoChanged = videoState.videoId !== prevVideoId.current

    if (videoChanged) {
      loadVideo(videoState.videoId)
      window.setTimeout(() => setCaptionsEnabled(captionsEnabled), 700)
      prevVideoId.current = videoState.videoId
      return
    }

    const localState = getPlayerState()
    setPlayerState(localState)

    if (localState === 0 && canControl && !endHandledRef.current) {
      endHandledRef.current = true
      emitVideoEnded()
    } else if (localState !== 0) {
      endHandledRef.current = false
    }

    if (localState === 0) {
      return
    }

    const localTime = getCurrentTime()
    const driftSeconds = Math.abs(videoState.currentTime - localTime)
    const maxAllowedDrift = 0.45

    if (videoState.isPlaying) {
      if (localState !== 1 || driftSeconds > maxAllowedDrift) {
        syncPlay(videoState.currentTime)
      }
    } else if (localState !== 2 || driftSeconds > maxAllowedDrift) {
      syncPause(videoState.currentTime)
    }

    if (!isDragging) {
      setSliderTime(videoState.currentTime)
    }
  }, [
    videoState.videoId,
    videoState.currentTime,
    videoState.isPlaying,
    loadVideo,
    syncPlay,
    syncPause,
    captionsEnabled,
    setCaptionsEnabled,
    getCurrentTime,
    getPlayerState,
    emitVideoEnded,
    canControl,
    isDragging,
  ])

  const handlePlay = () => {
    if (!canControl) return
    emitPlay(getCurrentTime())
  }

  const handlePause = () => {
    if (!canControl) return
    emitPause(getCurrentTime())
  }

  const handleToggleByClick = () => {
    if (!canControl || !videoState.videoId) return
    const state = getPlayerState()
    if (state === 1) {
      emitPause(getCurrentTime())
    } else {
      emitPlay(getCurrentTime())
    }
  }

  useEffect(() => {
    if (!videoState.videoId) {
      setDuration(0)
      setSliderTime(0)
      setMuted(false)
      setVolumeState(initialVolumeRef.current)
      volumeInitializedRef.current = false
      return
    }

    const tick = () => {
      if (readyRef.current && !volumeInitializedRef.current) {
        const initialVolume = initialVolumeRef.current
        setVolume(initialVolume)
        setVolumeState(initialVolume)
        setMuted(initialVolume === 0)
        volumeInitializedRef.current = true
      }

      const nextDuration = getDuration()
      if (nextDuration > 0) {
        setDuration(nextDuration)
      }

      setPlayerState(getPlayerState())

      if (!isDragging) {
        setSliderTime(getCurrentTime())
      }

      setMuted(isMuted())
      setVolumeState(getVolume())
    }

    tick()
    const id = window.setInterval(tick, 300)
    return () => window.clearInterval(id)
  }, [videoState.videoId, isDragging, getCurrentTime, getDuration, getVolume, isMuted, setVolume, readyRef, getPlayerState])

  const formatTime = (seconds) => {
    const safe = Math.max(0, Math.floor(seconds))
    const mins = Math.floor(safe / 60)
    const secs = safe % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const handleSeekChange = (value) => {
    setSliderTime(value)
  }

  const commitSeek = () => {
    if (!canControl || !videoState.videoId) return
    const nextTime = Math.max(0, Math.min(sliderTime, duration || sliderTime))
    emitSeek(nextTime)
    setIsDragging(false)
  }

  const ended = playerState === 0

  const handleVolumeChange = (nextVolume) => {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(nextVolume))
    setVolumeState(nextVolume)
    setVolume(nextVolume)
    setMuted(nextVolume === 0)
  }

  const handleToggleMute = () => {
    toggleMute()
    const nextMuted = !muted
    setMuted(nextMuted)
    if (!nextMuted && volume === 0) {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, '50')
      setVolume(50)
      setVolumeState(50)
      return
    }

    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(nextMuted ? 0 : volume))
  }

  const handleToggleCaptions = () => {
    const next = !captionsEnabled
    setCaptionsEnabledState(next)
    window.localStorage.setItem(CAPTIONS_STORAGE_KEY, next ? '1' : '0')
    setCaptionsEnabled(next)
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const handleToggleFullscreen = async () => {
    const el = containerRef.current
    if (!el) return

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen()
        return
      }

      await el.requestFullscreen()
    } catch {
      // Ignore if fullscreen is blocked by browser policy.
    }
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black rounded-xl overflow-hidden group">
      {!videoState.videoId && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface text-slate-500 gap-3">
          <div className="text-6xl opacity-20">▶</div>
          <p className="font-body text-sm">No video loaded</p>
          {canControl && <p className="font-body text-xs opacity-60">Paste a YouTube URL above to get started</p>}
        </div>
      )}

      <div id={PLAYER_ID} className="w-full h-full" />

      {canControl && videoState.videoId && !ended && (
        <button
          type="button"
          onClick={handleToggleByClick}
          className="absolute inset-0 z-10 cursor-pointer"
          aria-label="Toggle playback"
        />
      )}

      {videoState.videoId && !ended && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-3">
          <input
            type="range"
            min={0}
            max={Math.max(duration, sliderTime, 1)}
            step={0.1}
            value={Math.min(sliderTime, Math.max(duration, sliderTime, 1))}
            onMouseDown={() => canControl && setIsDragging(true)}
            onTouchStart={() => canControl && setIsDragging(true)}
            onChange={(e) => handleSeekChange(Number(e.target.value))}
            onMouseUp={commitSeek}
            onTouchEnd={commitSeek}
            disabled={!canControl}
            className={`w-full h-1.5 accent-white ${canControl ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
            aria-label="Seek video"
          />

          <div className="w-full max-w-full rounded-full bg-black/55 px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {canControl &&
                (videoState.isPlaying ? (
                  <button
                    onClick={handlePause}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                    aria-label="Pause"
                  >
                    <Pause size={17} />
                  </button>
                ) : (
                  <button
                    onClick={handlePlay}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                    aria-label="Play"
                  >
                    <Play size={17} />
                  </button>
                ))}

              <button
                type="button"
                onClick={handleToggleMute}
                className="text-white/90 hover:text-white"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={muted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-20 accent-white"
                aria-label="Volume"
                title="Volume (local only)"
              />

              <span className="font-mono text-xs text-white/90 min-w-[96px] whitespace-nowrap">
                {formatTime(sliderTime)} / {formatTime(duration || videoState.currentTime)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleCaptions}
                className={`text-white/90 hover:text-white ${captionsEnabled ? 'opacity-100' : 'opacity-60'}`}
                aria-label={captionsEnabled ? 'Disable captions' : 'Enable captions'}
                title={captionsEnabled ? 'Captions on' : 'Captions off'}
              >
                <Captions size={17} />
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="text-white/90 hover:text-white"
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canControl && videoState.videoId && !ended && (
        <div className="absolute inset-0 z-10 cursor-not-allowed" title="Only Host/Moderator can control playback" />
      )}
    </div>
  )
}

export default VideoPlayer
