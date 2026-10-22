import {useEffect, useMemo, useRef, useState} from 'react';

import type {FileFlag} from '../../core/domain/files';
import {DiffPrPanel} from './panels/diff-pr-panel';
import {ExplorerPanel} from './panels/explorer-panel';
import {FooterBar} from './panels/footer-bar';
import {NewTaskDialog} from './panels/new-task-dialog';
import {TopBar} from './panels/top-bar';
import {WelcomePanel} from './panels/welcome-panel';
import {WorkbenchPanel} from './panels/workbench-panel';
import {WorktreesPanel} from './panels/worktrees-panel';
import {
  errorMessage,
  type OpenFile,
  queueCounts,
  queueOf,
  statusesOf,
  useFlyStore,
} from './state/fly-store';
import {useTheme} from './theme/use-theme';

// Stable fallbacks, so an unselected or unpolled worktree keeps its props.
const noTabs: OpenFile[] = [];
const noFlags: Record<string, FileFlag> = {};
const noMtimes: Record<string, number | null> = {};

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
    diff,
    merging,
    loadDiff,
    mergePullRequest,
    setDiffPanel,
    openFiles,
    activeFile,
    trees,
    flags,
    filesError,
    diskMtimes,
    saving,
    openFile,
    closeFile,
    activateFile,
    setDirty,
    saveFile,
    reloadFile,
    keepFile,
    listDir,
    toggleDir,
    pollFiles,
    setExplorer,
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

  // Lists the root once per selection, when it was never listed; a poll
  // may create the tree (expanded dirs) before the root's entries land.
  useEffect(() => {
    const id = selectedWorktreeId;
    if (id && !useFlyStore.getState().trees[id]?.entries['']) {
      void listDir(id, '');
    }
  }, [selectedWorktreeId, listDir]);

  // openFiles keeps its reference until a tab changes, so tabs does too.
  const tabs = useMemo(
    () =>
      selectedWorktreeId
        ? openFiles.filter(file => file.worktreeId === selectedWorktreeId)
        : noTabs,
    [openFiles, selectedWorktreeId],
  );

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

  const openExternal = async (url: string) => {
    try {
      await window.fly.shell.openExternal(url);
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
  const panelOpen = config.diffPanel === 'open';
  const explorerOpen = selected !== null && config.explorer === 'open';
  const columns = [
    '320px',
    explorerOpen && '260px',
    '1fr',
    panelOpen && '380px',
  ]
    .filter(Boolean)
    .join(' ');

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
        diffPanel={config.diffPanel}
        onToggleDiffPanel={() =>
          void setDiffPanel(panelOpen ? 'collapsed' : 'open')
        }
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
            gridTemplateColumns: columns,
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
          {explorerOpen && (
            <ExplorerPanel
              worktree={selected}
              repoName={
                workspace.repos.find(repo => repo.id === selected.repoId)
                  ?.name ?? ''
              }
              tree={trees[selected.id]}
              flags={flags[selected.id] ?? noFlags}
              error={filesError[selected.id] ?? null}
              activePath={activeFile[selected.id] ?? null}
              onToggleDir={dir => void toggleDir(selected.id, dir)}
              onOpenFile={path => void openFile(selected.id, path)}
              onClose={() => void setExplorer('collapsed')}
            />
          )}
          <WorkbenchPanel
            worktree={selected}
            theme={theme}
            explorerCollapsed={config.explorer === 'collapsed'}
            onOpenExplorer={() => void setExplorer('open')}
            tabs={tabs}
            activePath={selected ? (activeFile[selected.id] ?? null) : null}
            mtimes={(selected && diskMtimes[selected.id]) ?? noMtimes}
            saving={saving}
            onActivate={path => selected && activateFile(selected.id, path)}
            onClose={path => selected && closeFile(selected.id, path)}
            onDirty={(path, dirty) =>
              selected && setDirty(selected.id, path, dirty)
            }
            onSave={(path, text) =>
              selected && void saveFile(selected.id, path, text)
            }
            onReload={path => selected && void reloadFile(selected.id, path)}
            onKeep={(path, mtimeMs) =>
              selected && keepFile(selected.id, path, mtimeMs)
            }
            onPoll={pollFiles}
            onOpenInEditor={path => void openInEditor(path)}
            session={{
              snapshot: sessions,
              activeSessionName,
              onStart: worktreeId => void startSession(worktreeId),
              onKill: name => void killSession(name),
              onSelectSession: setActiveSession,
            }}
          />
          {panelOpen && (
            <DiffPrPanel
              worktree={selected}
              diff={diff?.worktreeId === selected?.id ? diff : null}
              queue={selected ? queueOf(queue, selected.id) : null}
              merging={merging}
              onLoadDiff={loadDiff}
              onMerge={id => void mergePullRequest(id)}
              onOpenInEditor={path => void openInEditor(path)}
              onOpenExternal={url => void openExternal(url)}
            />
          )}
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
