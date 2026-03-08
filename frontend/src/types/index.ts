export type Role = 'host' | 'moderator' | 'participant';

export interface Participant {
  socketId: string;
  username: string;
  role: Role;
  joinedAt: number;
}

export interface VideoState {
  videoId: string;
  currentTime: number;
  isPlaying: boolean;
}

export interface RoomInfo {
  roomId: string;
  roomCode: string;
  name: string;
  participants: Participant[];
  videoState: VideoState;
  queue: string[];
  createdAt: number;
}

export interface ChatMessage {
  userId: string;
  username: string;
  role: Role;
  message: string;
  timestamp: number;
}

export const ROLE_LABELS: Record<Role, string> = {
  host: 'Host',
  moderator: 'Mod',
  participant: 'Viewer',
};

export const ROLE_COLORS: Record<Role, string> = {
  host: 'text-amber-400',
  moderator: 'text-cyan-400',
  participant: 'text-slate-400',
};

export const ROLE_BG: Record<Role, string> = {
  host: 'bg-amber-400/10 border-amber-400/30 text-amber-400',
  moderator: 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400',
  participant: 'bg-slate-400/10 border-slate-400/30 text-slate-400',
};
