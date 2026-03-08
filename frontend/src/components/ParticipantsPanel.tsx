import React, { useState } from 'react';
import { Participant, Role, ROLE_BG, ROLE_LABELS } from '../types';
import { useSocket } from '../context/SocketContext';
import { Crown, Shield, User, MoreVertical, X, ArrowUpDown } from 'lucide-react';

interface ParticipantsPanelProps {
  participants: Participant[];
  me: Participant;
}

const RoleIcon = ({ role }: { role: Role }) => {
  if (role === 'host') return <Crown size={12} className="text-amber-400" />;
  if (role === 'moderator') return <Shield size={12} className="text-cyan-400" />;
  return <User size={12} className="text-slate-500" />;
};

const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({ participants, me }) => {
  const { emitAssignRole, emitRemoveParticipant, emitTransferHost } = useSocket();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const isHost = me.role === 'host';

  const handleAssignRole = (userId: string, role: Role) => {
    emitAssignRole(userId, role);
    setOpenMenu(null);
  };

  const handleKick = (userId: string) => {
    if (confirm('Remove this participant from the room?')) {
      emitRemoveParticipant(userId);
    }
    setOpenMenu(null);
  };

  const handleTransferHost = (userId: string) => {
    if (confirm('Transfer host role to this participant?')) {
      emitTransferHost(userId);
    }
    setOpenMenu(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-display font-semibold text-sm text-white">
          Participants
        </h3>
        <span className="font-mono text-xs text-slate-500 bg-surface px-2 py-0.5 rounded-full">
          {participants.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {participants.map((p) => {
          const isSelf = p.socketId === me.socketId;
          const menuOpen = openMenu === p.socketId;

          return (
            <div key={p.socketId}
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors
                ${isSelf ? 'bg-accent/10 border border-accent/20' : 'hover:bg-surface'}`}
            >
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-bold
                ${p.role === 'host' ? 'bg-amber-400/20 text-amber-400' :
                  p.role === 'moderator' ? 'bg-cyan-400/20 text-cyan-400' :
                  'bg-slate-700 text-slate-300'}`}
              >
                {p.username[0]?.toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-body text-sm text-white truncate">
                    {p.username}
                    {isSelf && <span className="ml-1 text-xs text-slate-500">(you)</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <RoleIcon role={p.role} />
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${ROLE_BG[p.role]}`}>
                    {ROLE_LABELS[p.role]}
                  </span>
                </div>
              </div>

              {/* Host actions menu */}
              {isHost && !isSelf && (
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(menuOpen ? null : p.socketId)}
                    className="p-1 rounded text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <MoreVertical size={14} />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-7 z-50 w-48 bg-panel border border-border rounded-xl shadow-card overflow-hidden animate-slide-up">
                      <div className="p-1">
                        <p className="px-3 py-1.5 text-xs font-mono text-slate-500 uppercase tracking-wide">
                          Assign Role
                        </p>
                        {(['moderator', 'participant'] as Role[]).map(role => (
                          <button
                            key={role}
                            onClick={() => handleAssignRole(p.socketId, role)}
                            disabled={p.role === role}
                            className="w-full text-left px-3 py-2 text-sm font-body text-slate-300 
                                       hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30"
                          >
                            <span className={`inline-block w-2 h-2 rounded-full mr-2
                              ${role === 'moderator' ? 'bg-cyan-400' : 'bg-slate-400'}`} />
                            Make {ROLE_LABELS[role]}
                          </button>
                        ))}
                        <div className="my-1 border-t border-border" />
                        <button
                          onClick={() => handleTransferHost(p.socketId)}
                          className="w-full text-left px-3 py-2 text-sm font-body text-amber-400 
                                     hover:bg-amber-400/5 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <ArrowUpDown size={13} />
                          Transfer Host
                        </button>
                        <button
                          onClick={() => handleKick(p.socketId)}
                          className="w-full text-left px-3 py-2 text-sm font-body text-danger 
                                     hover:bg-danger/5 rounded-lg transition-colors flex items-center gap-2"
                        >
                          <X size={13} />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Click outside to close */}
      {openMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
      )}
    </div>
  );
};

export default ParticipantsPanel;
