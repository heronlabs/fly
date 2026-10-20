import {CodeOutlined} from '@ant-design/icons';
import type {KeyboardEvent} from 'react';

import type {QueueStatus} from '../../../core/domain/queue';
import type {Workspace} from '../../../core/domain/workspace';
import {StatusBadge, StatusDot} from '../components/status-dot';
import {groupsOf} from '../state/fly-store';

type Props = {
  workspace: Workspace;
  selectedId: string | null;
  onSelect(id: string): void;
  onOpenInEditor(path: string): void;
  sessionCounts: Record<string, number>;
  statuses: Record<string, QueueStatus>;
};

export const WorktreesPanel = ({
  workspace,
  selectedId,
  onSelect,
  onOpenInEditor,
  sessionCounts,
  statuses,
}: Props) => {
  const activate = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <nav
      aria-label="Worktrees"
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '8px 0',
        background: 'var(--drawer)',
      }}
    >
      {groupsOf(workspace).map(({group, repos}) => (
        <section key={group}>
          {group !== '' && (
            <h2
              style={{
                margin: 0,
                padding: '10px 14px 4px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              {group}
            </h2>
          )}
          {repos.map(({repo, worktrees}) => (
            <div key={repo.id}>
              <div
                style={{
                  padding: '6px 14px 2px',
                  fontWeight: 600,
                  color: 'var(--text)',
                }}
              >
                {repo.name}
              </div>
              {repo.error && (
                <div style={{padding: '2px 14px', color: 'var(--err)'}}>
                  {repo.error}
                </div>
              )}
              <div role="listbox" aria-label={repo.name}>
                {worktrees.map(worktree => {
                  const selected = worktree.id === selectedId;
                  const status = statuses[worktree.id] ?? 'idle';
                  return (
                    <div
                      key={worktree.id}
                      role="none"
                      className="fly-worktree"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: selected ? 'var(--active)' : 'transparent',
                      }}
                    >
                      <div
                        role="option"
                        tabIndex={0}
                        aria-selected={selected}
                        onClick={() => onSelect(worktree.id)}
                        onKeyDown={event => activate(event, worktree.id)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 8px 4px 26px',
                          cursor: 'pointer',
                          color: selected ? 'var(--strong)' : 'var(--text2)',
                          fontFamily: 'var(--fontMono)',
                        }}
                      >
                        <StatusDot status={status} />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {worktree.branch ?? worktree.head.slice(0, 7)}
                        </span>
                        {(sessionCounts[worktree.id] ?? 0) >= 1 && (
                          <span
                            role="img"
                            aria-label="Sessão ativa"
                            style={{
                              display: 'inline-block',
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              flex: 'none',
                              background: 'var(--ok)',
                            }}
                          />
                        )}
                        <StatusBadge status={status} />
                      </div>
                      <button
                        type="button"
                        aria-label="Abrir no VSCode"
                        title="Abrir no VSCode"
                        className="fly-worktree-action"
                        onClick={() => onOpenInEditor(worktree.path)}
                        style={{
                          background: 'none',
                          border: 0,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          color: 'var(--muted)',
                        }}
                      >
                        <CodeOutlined />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </nav>
  );
};
