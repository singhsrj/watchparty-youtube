import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRoom, getRoomByCode } from '../utils/api'
import { Play, Users, Hash, Sparkles, ArrowRight, Tv } from 'lucide-react'

const HomePage = () => {
  const navigate = useNavigate()
  const [mode, setMode] = useState('home')
  const [roomName, setRoomName] = useState('')
  const [username, setUsername] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinUsername, setJoinUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!roomName.trim() || !username.trim()) {
      setError('Please fill in all fields')
      return
    }
    setLoading(true)
    setError('')
    try {
      const room = await createRoom(roomName.trim(), username.trim())
      navigate(`/room/${room.id}?username=${encodeURIComponent(username.trim())}`)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to create room')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!joinCode.trim() || !joinUsername.trim()) {
      setError('Please fill in all fields')
      return
    }
    setLoading(true)
    setError('')
    try {
      const room = await getRoomByCode(joinCode.trim().toUpperCase())
      navigate(`/room/${room.id}?username=${encodeURIComponent(joinUsername.trim())}`)
    } catch {
      setError('Room not found. Check the code and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-void flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-accent/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[420px] h-[420px] bg-glow/15 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-8 w-[280px] h-[280px] bg-accent-dim/35 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,68,56,0.78) 1px, transparent 1px), linear-gradient(90deg, rgba(255,68,56,0.78) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center shadow-accent-glow border border-red-300/20">
              <Tv size={22} className="text-white" />
            </div>
          </div>
          <h1 className="font-display text-5xl font-bold text-white tracking-tight mb-3">
            Watch<span className="text-accent">Party</span>
          </h1>
          <p className="font-body text-slate-400 text-lg">Watch YouTube together, in perfect sync.</p>
        </div>

        {mode === 'home' && (
          <div className="space-y-3 animate-fade-in">
            <button
              onClick={() => {
                setMode('create')
                setError('')
              }}
              className="w-full flex items-center justify-between px-6 py-4 bg-gradient-to-r from-accent to-accent-bright rounded-2xl text-white font-display font-semibold text-lg transition-all shadow-accent-glow hover:brightness-110 group"
            >
              <span className="flex items-center gap-3">
                <Sparkles size={20} />
                Create a Room
              </span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => {
                setMode('join')
                setError('')
              }}
              className="w-full flex items-center justify-between px-6 py-4 bg-panel/80 backdrop-blur-sm hover:bg-surface border border-border hover:border-accent/60 rounded-2xl text-white font-display font-semibold text-lg transition-all group"
            >
              <span className="flex items-center gap-3">
                <Users size={20} className="text-accent" />
                Join a Room
              </span>
              <ArrowRight size={18} className="text-slate-500 group-hover:translate-x-1 group-hover:text-white transition-all" />
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="bg-panel/85 backdrop-blur-md border border-border rounded-2xl p-6 space-y-4 animate-slide-up shadow-card">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-bold text-white text-xl">Create Room</h2>
              <button
                onClick={() => {
                  setMode('home')
                  setError('')
                }}
                className="text-slate-500 hover:text-white text-sm font-body transition-colors"
              >
                ← Back
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 uppercase tracking-wide mb-1.5">Room Name</label>
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Movie Night, Anime Watch-along..."
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-white font-body placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 uppercase tracking-wide mb-1.5">Your Name</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="How should we call you?"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-white font-body placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all"
                  maxLength={50}
                />
              </div>
            </div>

            {error && (
              <p className="text-danger text-sm font-body bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">{error}</p>
            )}

            <button
              onClick={handleCreate}
              disabled={loading || !roomName.trim() || !username.trim()}
              className="w-full py-3.5 bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white font-display font-semibold transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Play size={16} />
                  Create & Enter
                </span>
              )}
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="bg-panel/85 backdrop-blur-md border border-border rounded-2xl p-6 space-y-4 animate-slide-up shadow-card">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display font-bold text-white text-xl">Join Room</h2>
              <button
                onClick={() => {
                  setMode('home')
                  setError('')
                }}
                className="text-slate-500 hover:text-white text-sm font-body transition-colors"
              >
                ← Back
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-slate-500 uppercase tracking-wide mb-1.5">Room Code</label>
                <div className="relative">
                  <Hash size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="8-character code"
                    className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-xl text-white font-mono placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all tracking-widest uppercase"
                    maxLength={8}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-500 uppercase tracking-wide mb-1.5">Your Name</label>
                <input
                  value={joinUsername}
                  onChange={(e) => setJoinUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="How should we call you?"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-white font-body placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all"
                  maxLength={50}
                />
              </div>
            </div>

            {error && (
              <p className="text-danger text-sm font-body bg-danger/10 border border-danger/20 rounded-xl px-3 py-2">{error}</p>
            )}

            <button
              onClick={handleJoin}
              disabled={loading || !joinCode.trim() || !joinUsername.trim()}
              className="w-full py-3.5 bg-accent hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white font-display font-semibold transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Joining...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Users size={16} />
                  Join Room
                </span>
              )}
            </button>
          </div>
        )}

        {mode === 'home' && (
          <div className="mt-12 grid grid-cols-3 gap-4 text-center animate-fade-in">
            {[
              { icon: '⚡', label: 'Real-time sync' },
              { icon: '🎭', label: 'Role system' },
              { icon: '💬', label: 'Group chat' },
            ].map((f) => (
              <div key={f.label} className="flex flex-col items-center gap-2">
                <span className="text-2xl">{f.icon}</span>
                <span className="text-xs font-body text-slate-500">{f.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default HomePage
