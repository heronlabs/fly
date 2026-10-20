import {useEffect, useRef} from 'react';

import {FooterBar} from './panels/footer-bar';
import {PlaceholderPanel} from './panels/placeholder-panel';
import {TopBar} from './panels/top-bar';
import {WelcomePanel} from './panels/welcome-panel';
import {WorktreesPanel} from './panels/worktrees-panel';
import {errorMessage, useFlyStore} from './state/fly-store';
import {useTheme} from './theme/use-theme';

const counts = {ready: 0, working: 0, ci: 0, failed: 0};

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
  } = useFlyStore();
  const theme = useTheme(config.theme);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (!bootstrapped.current) {
      bootstrapped.current = true;
      void bootstrap();
    }
    return window.fly.workspace.onChanged(applyWorkspace);
  }, [bootstrap, applyWorkspace]);

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
        onNewTask={() => undefined}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          minHeight: 0,
        }}
      >
        {error && (
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
            gridTemplateColumns: '260px 1fr 380px',
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
              sessionCounts={{}}
            />
          )}
          <PlaceholderPanel title="Sessão" hint="Terminal chega no marco 2" />
          <PlaceholderPanel title="Diff / PR" hint="Marco 4" />
        </div>
      </div>
      <FooterBar counts={counts} />
    </div>
  );
};
