import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Participant, RoomInfo, VideoState, ChatMessage } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8000';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  room: RoomInfo | null;
  me: Participant | null;
  videoState: VideoState;
  participants: Participant[];
  chatMessages: ChatMessage[];
  error: string | null;
  kickedReason: string | null;
  joinRoom: (roomId: string, username: string) => void;
  leaveRoom: () => void;
  emitPlay: (currentTime: number) => void;
  emitPause: (currentTime: number) => void;
  emitSeek: (currentTime: number) => void;
  emitChangeVideo: (videoId: string) => void;
  emitAssignRole: (userId: string, role: string) => void;
  emitRemoveParticipant: (userId: string) => void;
  emitTransferHost: (userId: string) => void;
  emitChatMessage: (message: string) => void;
  requestSync: () => void;
  clearError: () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [me, setMe] = useState<Participant | null>(null);
  const [videoState, setVideoState] = useState<VideoState>({ videoId: '', currentTime: 0, isPlaying: false });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [kickedReason, setKickedReason] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(WS_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('room_joined', ({ room, you }: { room: RoomInfo; you: Participant }) => {
      setRoom(room);
      setMe(you);
      setParticipants(room.participants);
      setVideoState(room.videoState);
    });

    socket.on('user_joined', ({ participants }: { participants: Participant[] }) => {
      setParticipants(participants);
    });

    socket.on('user_left', ({ participants, newHost }: { participants: Participant[]; newHost?: Participant }) => {
      setParticipants(participants);
      if (newHost && socketRef.current?.id === newHost.socketId) {
        setMe(prev => prev ? { ...prev, role: 'host' } : null);
      }
    });

    socket.on('sync_state', (state: VideoState) => {
      setVideoState(state);
    });

    socket.on('role_assigned', ({ userId, role, participants }: { userId: string; role: string; participants: Participant[] }) => {
      setParticipants(participants);
      if (socket.id === userId) {
        setMe(prev => prev ? { ...prev, role: role as any } : null);
      }
    });

    socket.on('participant_removed', ({ participants }: { participants: Participant[] }) => {
      setParticipants(participants);
    });

    socket.on('host_transferred', ({ newHostId, participants }: { newHostId: string; participants: Participant[] }) => {
      setParticipants(participants);
      if (socket.id === newHostId) {
        setMe(prev => prev ? { ...prev, role: 'host' } : null);
      } else if (me?.role === 'host') {
        setMe(prev => prev ? { ...prev, role: 'participant' } : null);
      }
    });

    socket.on('kicked', ({ reason }: { reason: string }) => {
      setKickedReason(reason);
      setRoom(null);
      setMe(null);
      setParticipants([]);
    });

    socket.on('chat_message', (msg: ChatMessage) => {
      setChatMessages(prev => [...prev.slice(-199), msg]);
    });

    socket.on('error', ({ message }: { message: string }) => {
      setError(message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinRoom = (roomId: string, username: string) => {
    socketRef.current?.emit('join_room', { roomId, username });
  };

  const leaveRoom = () => {
    socketRef.current?.emit('leave_room', {});
    setRoom(null);
    setMe(null);
    setParticipants([]);
    setChatMessages([]);
  };

  const emitPlay = (currentTime: number) => socketRef.current?.emit('play', { currentTime });
  const emitPause = (currentTime: number) => socketRef.current?.emit('pause', { currentTime });
  const emitSeek = (currentTime: number) => socketRef.current?.emit('seek', { currentTime });
  const emitChangeVideo = (videoId: string) => socketRef.current?.emit('change_video', { videoId });
  const emitAssignRole = (userId: string, role: string) => socketRef.current?.emit('assign_role', { userId, role });
  const emitRemoveParticipant = (userId: string) => socketRef.current?.emit('remove_participant', { userId });
  const emitTransferHost = (userId: string) => socketRef.current?.emit('transfer_host', { userId });
  const emitChatMessage = (message: string) => socketRef.current?.emit('chat_message', { message });
  const requestSync = () => socketRef.current?.emit('request_sync', {});
  const clearError = () => setError(null);

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current, connected, room, me, videoState,
      participants, chatMessages, error, kickedReason,
      joinRoom, leaveRoom, emitPlay, emitPause, emitSeek,
      emitChangeVideo, emitAssignRole, emitRemoveParticipant,
      emitTransferHost, emitChatMessage, requestSync, clearError,
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};
