export type Session = {
  name: string;
  worktreeId: string;
  createdAt: number;
  attachedClients: number;
  origin: 'fly' | 'external';
  task: string | null;
};

export type SessionsSnapshot = {
  tmux: 'ok' | 'missing' | 'error';
  message: string | null;
  sessions: Session[];
};
