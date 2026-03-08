import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useSocket } from '../context/SocketContext'
import VideoPlayer from '../components/VideoPlayer'
import ParticipantsPanel from '../components/ParticipantsPanel'
import ChatPanel from '../components/ChatPanel'
import VideoInput from '../components/VideoInput'
import { ROLE_BG, ROLE_LABELS } from '../types'
import {
  Copy,
  Check,
  LogOut,
  Users,
  MessageSquare,
  Wifi,
  WifiOff,
  Crown,
  AlertTriangle,
  Tv,
} from 'lucide-react'

const RoomPage = () => {
  const { roomId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const username = searchParams.get('username') || 'Anonymous'

  const {
    connected,
    room,
    me,
    videoState,
    participants,
    chatMessages,
    error,
    kickedReason,
    joinRoom,
    leaveRoom,
    requestSync,
    clearError,
  } = useSocket()

  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('participants')
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    if (connected && roomId && !joined) {
      joinRoom(roomId, username)
      setJoined(true)
    }
  }, [connected, roomId, joined, joinRoom, username])

  useEffect(() => {
    if (!room || !me) return

    const initial = window.setTimeout(() => requestSync(), 500)
    const interval = window.setInterval(() => requestSync(), 3000)

    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [room?.roomId, me?.socketId, requestSync])

  useEffect(() => {
    if (kickedReason) {
      window.alert(kickedReason)
      navigate('/')
    }
  }, [kickedReason, navigate])

  const canControl = me?.role === 'host' || me?.role === 'moderator'

  const handleCopyCode = () => {
    if (!room) return
    navigator.clipboard.writeText(room.roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLeave = () => {
    if (window.confirm('Leave the room?')) {
      leaveRoom()
      navigate('/')
    }
  }

  if (!connected) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          <p className="font-body text-slate-400">Connecting...</p>
        </div>
      </div>
    )
  }

  if (!room || !me) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          <p className="font-body text-slate-400">Joining room...</p>
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 max-w-sm">
              <p className="text-danger text-sm font-body">{error}</p>
              <button
                onClick={() => {
                  clearError()
                  navigate('/')
                }}
                className="mt-2 text-xs text-slate-400 underline"
              >
                Go back home
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-void flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/3 w-[520px] h-[320px] bg-accent/15 blur-3xl rounded-full" />
        <div className="absolute bottom-0 -right-20 w-[420px] h-[320px] bg-accent-dim/25 blur-3xl rounded-full" />
      </div>

      <header className="relative flex items-center justify-between px-4 py-2.5 bg-panel/85 backdrop-blur-md border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center shadow-accent-glow">
            <Tv size={14} className="text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-white text-base leading-tight">{room.name}</h1>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{room.roomCode}</span>
              <button onClick={handleCopyCode} className="text-slate-500 hover:text-accent transition-colors">
                {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
              </button>
              <span className="text-slate-700">·</span>
              <span className="text-xs text-slate-500 font-body">{participants.length} watching</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {me && (
            <span className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border ${ROLE_BG[me.role]}`}>
              {me.role === 'host' && <Crown size={10} />}
              {ROLE_LABELS[me.role]}
            </span>
          )}

          <div className={`flex items-center gap-1.5 text-xs font-mono ${connected ? 'text-success' : 'text-danger'}`}>
            {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
          </div>

          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-danger/10 hover:text-danger border border-border hover:border-danger/30 text-slate-400 text-sm font-body transition-all"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-danger/10 border border-danger/30 rounded-xl px-4 py-2.5 animate-slide-up">
          <AlertTriangle size={14} className="text-danger shrink-0" />
          <p className="text-danger text-sm font-body flex-1">{error}</p>
          <button onClick={clearError} className="text-danger/70 hover:text-danger text-xs">✕</button>
        </div>
      )}

      <div className="relative flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 p-3 gap-3 overflow-hidden">
          <VideoInput canControl={canControl} />
          <div className="w-full aspect-video max-w-5xl mx-auto bg-black border border-border/80 rounded-xl overflow-hidden shadow-card">
            <VideoPlayer videoState={videoState} canControl={canControl} />
          </div>
        </div>

        <div className="w-72 xl:w-80 flex flex-col border-l border-border bg-panel/70 backdrop-blur-md shrink-0">
          <div className="flex border-b border-border shrink-0">
            {['participants', 'chat'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-display font-semibold transition-all ${
                  activeTab === tab ? 'text-white border-b-2 border-accent' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab === 'participants' ? <Users size={13} /> : <MessageSquare size={13} />}
                {tab === 'participants' ? 'People' : 'Chat'}
                {tab === 'chat' && chatMessages.length > 0 && (
                  <span className="ml-0.5 bg-accent text-white text-xs rounded-full px-1.5 py-0.5 font-mono leading-none">
                    {chatMessages.length > 99 ? '99+' : chatMessages.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'participants' ? (
              <ParticipantsPanel participants={participants} me={me} />
            ) : (
              <ChatPanel messages={chatMessages} mySocketId={me.socketId} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RoomPage
