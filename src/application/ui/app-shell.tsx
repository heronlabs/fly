import {useEffect, useMemo, useRef, useState} from 'react';

import {FooterBar} from './panels/footer-bar';
import {NewTaskDialog} from './panels/new-task-dialog';
import {PlaceholderPanel} from './panels/placeholder-panel';
import {SessionPanel} from './panels/session-panel';
import {TopBar} from './panels/top-bar';
import {WelcomePanel} from './panels/welcome-panel';
import {WorktreesPanel} from './panels/worktrees-panel';
import {
  errorMessage,
  queueCounts,
  statusesOf,
  useFlyStore,
} from './state/fly-store';
import {useTheme} from './theme/use-theme';

export const AppShell = () => {
  const {
    workspace,
    config,
    selectedWorktreeId,
    error,
    bootstrap,
    pickAndOpen,
    openRoot,
    select,
    setTheme,
    applyWorkspace,
    sessions,
    activeSessionName,
    applySessions,
    queue,
    applyQueue,
    startSession,
    killSession,
    createTask,
    setActiveSession,
  } = useFlyStore();
  const theme = useTheme(config.theme);
  const bootstrapped = useRef(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const canCreateTask = (workspace?.repos.length ?? 0) > 0;

  useEffect(() => {
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      void bootstrap();
    }
    return window.fly.workspace.onChanged(applyWorkspace);
  }, [bootstrap, applyWorkspace]);

  useEffect(
    () => window.fly.sessions.onChanged(applySessions),
    [applySessions],
  );

  useEffect(() => window.fly.queue.onChanged(applyQueue), [applyQueue]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === 'n' && canCreateTask) {
        event.preventDefault();
        openTask();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canCreateTask]);

  const sessionCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const session of sessions.sessions) {
      result[session.worktreeId] = (result[session.worktreeId] ?? 0) + 1;
    }
    return result;
  }, [sessions]);

  const counts = useMemo(() => queueCounts(queue), [queue]);
  const statuses = useMemo(() => statusesOf(queue), [queue]);

  const openTask = () => {
    useFlyStore.setState({error: null});
    setTaskOpen(true);
  };

  const openInEditor = async (path: string) => {
    try {
      await window.fly.shell.openInEditor(path);
    } catch (failure) {
      useFlyStore.setState({error: errorMessage(failure)});
    }
  };

  if (!workspace) {
    return (
      <WelcomePanel
        recentRoots={config.recentRoots}
        onPick={() => void pickAndOpen()}
        onOpen={root => void openRoot(root)}
        error={error}
      />
    );
  }

  const selected =
    workspace.worktrees.find(worktree => worktree.id === selectedWorktreeId) ??
    null;

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
      }}
    >
      <TopBar
        root={workspace.root}
        selected={selected}
        theme={theme}
        onToggleTheme={() => void setTheme(theme === 'dark' ? 'light' : 'dark')}
        onOpenFolder={() => void pickAndOpen()}
        onOpenInEditor={() => selected && void openInEditor(selected.path)}
        canCreateTask={canCreateTask}
        onNewTask={openTask}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          minHeight: 0,
        }}
      >
        {error && !taskOpen && (
          <p
            role="alert"
            style={{margin: 0, padding: '6px 14px', color: 'var(--err)'}}
          >
            {error}
          </p>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr 380px',
            gridRow: 2,
            minHeight: 0,
          }}
        >
          {workspace.repos.length === 0 ? (
            <div style={{padding: 14, background: 'var(--drawer)'}}>
              <p>Nenhum repositório em {workspace.root}</p>
              <button type="button" onClick={() => void pickAndOpen()}>
                Abrir outra pasta
              </button>
            </div>
          ) : (
            <WorktreesPanel
              workspace={workspace}
              selectedId={selectedWorktreeId}
              onSelect={select}
              onOpenInEditor={path => void openInEditor(path)}
              sessionCounts={sessionCounts}
              statuses={statuses}
            />
          )}
          <SessionPanel
            worktree={selected}
            snapshot={sessions}
            activeSessionName={activeSessionName}
            theme={theme}
            onStart={worktreeId => void startSession(worktreeId)}
            onKill={name => void killSession(name)}
            onSelectSession={setActiveSession}
          />
          <PlaceholderPanel title="Diff / PR" hint="Marco 4" />
        </div>
      </div>
      <FooterBar counts={counts} message={queue.message} />
      <NewTaskDialog
        open={taskOpen}
        repos={workspace.repos}
        defaultRepoId={selected?.repoId ?? null}
        error={error}
        submitting={submitting}
        onCancel={() => {
          useFlyStore.setState({error: null});
          setTaskOpen(false);
        }}
        onSubmit={input => {
          setSubmitting(true);
          void createTask(input)
            .then(ok => ok && setTaskOpen(false))
            .finally(() => setSubmitting(false));
        }}
      />
    </div>
  );
};
