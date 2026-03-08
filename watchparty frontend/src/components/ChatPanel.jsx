import React, { useState, useRef, useEffect } from 'react'
import { ROLE_COLORS, ROLE_LABELS } from '../types'
import { useSocket } from '../context/SocketContext'
import { Send } from 'lucide-react'

const ChatPanel = ({ messages, mySocketId }) => {
  const { emitChatMessage } = useSocket()
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || trimmed.length > 500) return
    emitChatMessage(trimmed)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (ts) => {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-3 border-b border-border">
        <h3 className="font-display font-semibold text-sm text-white">Chat</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-xs text-slate-600 mt-8 font-body">No messages yet. Say hello!</p>
        )}
        {messages.map((msg, i) => {
          const isSelf = msg.userId === mySocketId
          return (
            <div key={i} className={`flex flex-col gap-0.5 ${isSelf ? 'items-end' : 'items-start'}`}>
              {!isSelf && (
                <div className="flex items-center gap-1.5 px-1">
                  <span className={`text-xs font-body font-medium ${ROLE_COLORS[msg.role]}`}>{msg.username}</span>
                  <span className="text-xs text-slate-600 font-mono">{ROLE_LABELS[msg.role]}</span>
                </div>
              )}
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm font-body leading-relaxed ${
                  isSelf
                    ? 'bg-accent text-white rounded-br-sm'
                    : 'bg-surface border border-border text-slate-200 rounded-bl-sm'
                }`}
              >
                {msg.message}
              </div>
              <span className="text-xs text-slate-600 font-mono px-1">{formatTime(msg.timestamp)}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            maxLength={500}
            className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-sm font-body text-white placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2 rounded-xl bg-accent hover:bg-accent-bright disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatPanel
