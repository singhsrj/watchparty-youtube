import React, { useState } from 'react'
import { useSocket } from '../context/SocketContext'
import { extractYouTubeId } from '../utils/api'
import { Link, Check, AlertCircle } from 'lucide-react'

const VideoInput = ({ canControl }) => {
  const { emitChangeVideo, emitAddToQueue, queue } = useSocket()
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle')

  const handleSubmit = () => {
    const videoId = extractYouTubeId(input.trim())
    if (!videoId) {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
      return
    }
    emitChangeVideo(videoId)
    setInput('')
    setStatus('success')
    setTimeout(() => setStatus('idle'), 2000)
  }

  const handleQueue = () => {
    const videoId = extractYouTubeId(input.trim())
    if (!videoId) {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
      return
    }
    emitAddToQueue(videoId)
    setInput('')
    setStatus('success')
    setTimeout(() => setStatus('idle'), 2000)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  if (!canControl) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl opacity-50">
        <Link size={14} className="text-slate-500 shrink-0" />
        <span className="text-sm font-body text-slate-500">Only Host/Moderator can change video</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-mono text-slate-500 px-1">Up next queue: {queue.length}</div>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Link size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              setStatus('idle')
            }}
            onKeyDown={handleKeyDown}
            placeholder="Paste YouTube URL or video ID..."
            className={`w-full pl-9 pr-3 py-2.5 bg-surface border rounded-xl text-sm font-body text-white
                      placeholder-slate-600 focus:outline-none transition-all
                      ${
                        status === 'error'
                          ? 'border-danger/60 focus:border-danger'
                          : status === 'success'
                            ? 'border-success/60'
                            : 'border-border focus:border-accent/50 focus:ring-1 focus:ring-accent/30'
                      }`}
          />
        </div>
        <button
          onClick={handleSubmit}
          className={`px-4 py-2.5 rounded-xl text-sm font-display font-semibold transition-all
          ${
            status === 'error'
              ? 'bg-danger/20 text-danger border border-danger/40'
              : status === 'success'
                ? 'bg-success/20 text-success border border-success/40'
                : 'bg-accent hover:bg-accent-bright text-white'
          }`}
        >
          {status === 'error' ? (
            <span className="flex items-center gap-1.5"><AlertCircle size={14} /> Invalid</span>
          ) : status === 'success' ? (
            <span className="flex items-center gap-1.5"><Check size={14} /> Done</span>
          ) : (
            'Load'
          )}
        </button>
        <button
          onClick={handleQueue}
          className="px-4 py-2.5 rounded-xl text-sm font-display font-semibold transition-all bg-surface border border-border text-slate-200 hover:border-accent/40 hover:text-white"
        >
          Queue
        </button>
      </div>
    </div>
  )
}

export default VideoInput
