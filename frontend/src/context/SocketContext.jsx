import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const PROD_WS_URL = 'https://watchparty-youtube.onrender.com'
const WS_URL = import.meta.env.VITE_WS_URL || PROD_WS_URL

const SocketContext = createContext(null)

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [room, setRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [videoState, setVideoState] = useState({ videoId: '', currentTime: 0, isPlaying: false })
  const [participants, setParticipants] = useState([])
  const [queue, setQueue] = useState([])
  const [chatMessages, setChatMessages] = useState([])
  const [error, setError] = useState(null)
  const [kickedReason, setKickedReason] = useState(null)

  useEffect(() => {
    // Keep transport negotiation default so Render can start with polling and upgrade.
    const socket = io(WS_URL)
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err?.message || err)
      setError('Realtime connection failed. Retrying...')
    })

    socket.on('room_joined', ({ room: joinedRoom, you }) => {
      setRoom(joinedRoom)
      setMe(you)
      setParticipants(joinedRoom.participants)
      setQueue(joinedRoom.queue || [])
      setVideoState(joinedRoom.videoState)
    })

    socket.on('queue_updated', ({ queue: nextQueue }) => {
      setQueue(nextQueue || [])
    })

    socket.on('user_joined', ({ participants: nextParticipants }) => {
      setParticipants(nextParticipants)
    })

    socket.on('user_left', ({ participants: nextParticipants, newHost }) => {
      setParticipants(nextParticipants)
      if (newHost && socketRef.current?.id === newHost.socketId) {
        setMe((prev) => (prev ? { ...prev, role: 'host' } : null))
      }
    })

    socket.on('sync_state', (state) => {
      setVideoState(state)
    })

    socket.on('role_assigned', ({ userId, role, participants: nextParticipants }) => {
      setParticipants(nextParticipants)
      if (socket.id === userId) {
        setMe((prev) => (prev ? { ...prev, role } : null))
      }
    })

    socket.on('participant_removed', ({ participants: nextParticipants }) => {
      setParticipants(nextParticipants)
    })

    socket.on('host_transferred', ({ newHostId, participants: nextParticipants }) => {
      setParticipants(nextParticipants)
      if (socket.id === newHostId) {
        setMe((prev) => (prev ? { ...prev, role: 'host' } : null))
      } else {
        setMe((prev) => (prev && prev.role === 'host' ? { ...prev, role: 'participant' } : prev))
      }
    })

    socket.on('kicked', ({ reason }) => {
      setKickedReason(reason)
      setRoom(null)
      setMe(null)
      setParticipants([])
    })

    socket.on('chat_message', (msg) => {
      setChatMessages((prev) => [...prev.slice(-199), msg])
    })

    socket.on('error', ({ message }) => {
      setError(message)
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  const joinRoom = (roomId, username) => {
    socketRef.current?.emit('join_room', { roomId, username })
  }

  const leaveRoom = () => {
    socketRef.current?.emit('leave_room', {})
    setRoom(null)
    setMe(null)
    setParticipants([])
    setQueue([])
    setChatMessages([])
  }

  const emitPlay = (currentTime) => socketRef.current?.emit('play', { currentTime })
  const emitPause = (currentTime) => socketRef.current?.emit('pause', { currentTime })
  const emitSeek = (currentTime) => socketRef.current?.emit('seek', { currentTime })
  const emitChangeVideo = (videoId) => socketRef.current?.emit('change_video', { videoId })
  const emitAddToQueue = (videoId) => socketRef.current?.emit('add_to_queue', { videoId })
  const emitVideoEnded = () => socketRef.current?.emit('video_ended', {})
  const emitAssignRole = (userId, role) => socketRef.current?.emit('assign_role', { userId, role })
  const emitRemoveParticipant = (userId) => socketRef.current?.emit('remove_participant', { userId })
  const emitTransferHost = (userId) => socketRef.current?.emit('transfer_host', { userId })
  const emitChatMessage = (message) => socketRef.current?.emit('chat_message', { message })
  const requestSync = () => socketRef.current?.emit('request_sync', {})
  const clearError = () => setError(null)

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        room,
        me,
        videoState,
        participants,
        queue,
        chatMessages,
        error,
        kickedReason,
        joinRoom,
        leaveRoom,
        emitPlay,
        emitPause,
        emitSeek,
        emitChangeVideo,
        emitAddToQueue,
        emitVideoEnded,
        emitAssignRole,
        emitRemoveParticipant,
        emitTransferHost,
        emitChatMessage,
        requestSync,
        clearError,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}
