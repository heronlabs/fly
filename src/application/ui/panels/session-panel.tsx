import {type CSSProperties, useState} from 'react';

import type {SessionsSnapshot} from '../../../core/domain/session';
import type {Worktree} from '../../../core/domain/workspace';
import {TerminalView} from '../terminal/terminal-view';
import type {ResolvedTheme} from '../theme/theme';

type Props = {
  worktree: Worktree | null;
  snapshot: SessionsSnapshot;
  activeSessionName: string | null;
  theme: ResolvedTheme;
  onStart(worktreeId: string): void;
  onKill(name: string): void;
  onSelectSession(name: string): void;
};

const buttonStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 10px',
  cursor: 'pointer',
};

const centered: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  background: 'var(--surface)',
  color: 'var(--muted)',
};

const ActiveSession = ({
  name,
  others,
  theme,
  onKill,
  onSelectSession,
}: {
  name: string;
  others: string[];
  theme: ResolvedTheme;
  onKill(name: string): void;
  onSelectSession(name: string): void;
}) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <section
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--surface)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderBottom: '1px solid var(--border)',
          color: 'var(--text2)',
        }}
      >
        <span style={{fontFamily: 'var(--fontMono)', flex: 1}}>{name}</span>
        {others.length > 0 && (
          <span
            role="group"
            aria-label="Outras sessões"
            style={{display: 'flex', alignItems: 'center', gap: 4}}
          >
            <span style={{color: 'var(--muted)'}}>Outras sessões</span>
            {others.map(other => (
              <button
                key={other}
                type="button"
                style={buttonStyle}
                onClick={() => onSelectSession(other)}
              >
                {other}
              </button>
            ))}
          </span>
        )}
        {confirming ? (
          <>
            <button
              type="button"
              style={{...buttonStyle, color: 'var(--err)'}}
              onClick={() => {
                setConfirming(false);
                onKill(name);
              }}
            >
              Confirmar
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            style={buttonStyle}
            onClick={() => setConfirming(true)}
          >
            Encerrar sessão
          </button>
        )}
      </header>
      <div style={{flex: 1, minHeight: 0}}>
        <TerminalView key={name} sessionName={name} theme={theme} />
      </div>
    </section>
  );
};

export const SessionPanel = ({
  worktree,
  snapshot,
  activeSessionName,
  theme,
  onStart,
  onKill,
  onSelectSession,
}: Props) => {
  if (!worktree) {
    return (
      <section style={centered}>
        <p style={{margin: 0}}>Selecione um worktree</p>
      </section>
    );
  }
  if (snapshot.tmux !== 'ok') {
    return (
      <section style={centered}>
        <p role="alert" style={{margin: 0, color: 'var(--err)'}}>
          {snapshot.message}
        </p>
      </section>
    );
  }
  const names = snapshot.sessions
    .filter(session => session.worktreeId === worktree.id)
    .map(session => session.name);
  const shown = names.find(name => name === activeSessionName) ?? names[0];
  if (shown === undefined) {
    return (
      <section style={centered}>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => onStart(worktree.id)}
        >
          Iniciar sessão
        </button>
      </section>
    );
  }
  return (
    <ActiveSession
      key={shown}
      name={shown}
      others={names.filter(name => name !== shown)}
      theme={theme}
      onKill={onKill}
      onSelectSession={onSelectSession}
    />
  );
};
