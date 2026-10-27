import {type CSSProperties, useEffect, useState} from 'react';

import type {DiffScope, WorktreeDiff} from '../../../core/domain/diff';
import type {WorktreeQueue} from '../../../core/domain/queue';
import type {Worktree} from '../../../core/domain/workspace';
import {DIFF_POLL_MS} from '../state/fly-store';
import {DiffView} from './diff-view';
import {PrView} from './pr-view';

type Tab = 'diff' | 'pr';

type Props = {
  worktree: Worktree | null;
  diff: WorktreeDiff | null;
  queue: WorktreeQueue | null;
  merging: boolean;
  onLoadDiff(worktreeId: string, scope: DiffScope): Promise<void> | void;
  onMerge(worktreeId: string): void;
  onOpenPr(worktreeId: string): Promise<void>;
  onOpenInEditor(path: string): void;
  onOpenExternal(url: string): void;
};

const tabStyle = (active: boolean): CSSProperties => ({
  background: active ? 'var(--surface)' : 'transparent',
  color: active ? 'var(--strong)' : 'var(--muted)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 10px',
  cursor: 'pointer',
});

const row: CSSProperties = {display: 'flex', gap: 6, padding: '8px 14px 0'};

const TabButton = ({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect(): void;
}) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    style={tabStyle(active)}
    onClick={onSelect}
  >
    {label}
  </button>
);

export const DiffPrPanel = ({
  worktree,
  diff,
  queue,
  merging,
  onLoadDiff,
  onMerge,
  onOpenPr,
  onOpenInEditor,
  onOpenExternal,
}: Props) => {
  const [tab, setTab] = useState<Tab>('diff');
  const [scope, setScope] = useState<DiffScope>('live');
  const worktreeId = worktree?.id;

  useEffect(() => {
    if (!worktreeId || tab !== 'diff') return;
    let pending = false;
    const poll = () => {
      if (pending) return;
      pending = true;
      void Promise.resolve(onLoadDiff(worktreeId, scope)).finally(() => {
        pending = false;
      });
    };
    poll();
    const id = setInterval(poll, DIFF_POLL_MS);
    return () => clearInterval(id);
  }, [worktreeId, tab, scope, onLoadDiff]);

  if (!worktree) {
    return (
      <aside style={{padding: 14, background: 'var(--drawer)'}}>
        <p style={{color: 'var(--muted)'}}>Selecione um worktree</p>
      </aside>
    );
  }

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: 'var(--drawer)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      <div role="tablist" style={row}>
        <TabButton
          active={tab === 'diff'}
          label="Diff"
          onSelect={() => setTab('diff')}
        />
        <TabButton
          active={tab === 'pr'}
          label="PR"
          onSelect={() => setTab('pr')}
        />
      </div>
      {tab === 'diff' && (
        <div role="tablist" style={row}>
          <TabButton
            active={scope === 'live'}
            label="Alterações locais"
            onSelect={() => setScope('live')}
          />
          <TabButton
            active={scope === 'branch'}
            label="Branch"
            onSelect={() => setScope('branch')}
          />
        </div>
      )}
      <div style={{flex: 1, minHeight: 0, marginTop: 8}}>
        {tab === 'diff' ? (
          <DiffView
            diff={diff?.scope === scope ? diff : null}
            onOpenInEditor={onOpenInEditor}
            worktreePath={worktree.path}
          />
        ) : (
          <PrView
            queue={queue}
            status={queue?.status ?? 'idle'}
            merging={merging}
            onMerge={() => onMerge(worktree.id)}
            onOpenPr={() => onOpenPr(worktree.id)}
            onOpenExternal={onOpenExternal}
          />
        )}
      </div>
    </aside>
  );
};
