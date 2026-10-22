import {useEffect, useRef} from 'react';

import type {SessionsSnapshot} from '../../../core/domain/session';
import type {Worktree} from '../../../core/domain/workspace';
import {type CodeEditorHandle, forgetEditorState} from '../editor/code-editor';
import {FILES_POLL_MS, type OpenFile} from '../state/fly-store';
import type {ResolvedTheme} from '../theme/theme';
import {EditorPanel} from './editor-panel';
import {FileTabs} from './file-tabs';
import {SessionPanel} from './session-panel';

type Props = {
  worktree: Worktree | null;
  theme: ResolvedTheme;
  explorerCollapsed: boolean;
  onOpenExplorer(): void;
  tabs: OpenFile[];
  activePath: string | null;
  mtimes: Record<string, number | null>;
  saving: boolean;
  onActivate(path: string | null): void;
  onClose(path: string): void;
  onDirty(path: string, dirty: boolean): void;
  onSave(path: string, text: string): void;
  onReload(path: string): void;
  onKeep(path: string, mtimeMs: number | null): void;
  onPoll(worktreeId: string): Promise<void> | void;
  onOpenInEditor(path: string): void;
  session: {
    snapshot: SessionsSnapshot;
    activeSessionName: string | null;
    onStart(worktreeId: string): void;
    onKill(name: string): void;
    onSelectSession(name: string): void;
  };
};

export const WorkbenchPanel = ({
  worktree,
  theme,
  explorerCollapsed,
  onOpenExplorer,
  tabs,
  activePath,
  mtimes,
  saving,
  onActivate,
  onClose,
  onDirty,
  onSave,
  onReload,
  onKeep,
  onPoll,
  onOpenInEditor,
  session,
}: Props) => {
  const editorRef = useRef<CodeEditorHandle>(null);
  const worktreeId = worktree?.id;
  const active = worktree
    ? tabs.find(file => file.path === activePath)
    : undefined;

  useEffect(() => {
    if (!worktreeId) return;
    let pending = false;
    const poll = () => {
      if (pending) return;
      pending = true;
      void Promise.resolve(onPoll(worktreeId)).finally(() => {
        pending = false;
      });
    };
    poll();
    const id = setInterval(poll, FILES_POLL_MS);
    return () => clearInterval(id);
  }, [worktreeId, onPoll]);

  // ⌘S works wherever the focus is; CodeMirror has no Mod-s (P12).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key !== 's') return;
      event.preventDefault();
      const handle = editorRef.current;
      if (active?.dirty && active.content.kind === 'text' && handle) {
        onSave(active.path, handle.getText());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onSave]);

  const close = (path: string) => {
    forgetEditorState(`${worktreeId}\0${path}`);
    onClose(path);
  };

  return (
    <div
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {worktree && (
        <FileTabs
          explorerCollapsed={explorerCollapsed}
          onOpenExplorer={onOpenExplorer}
          tabs={tabs}
          activePath={active?.path ?? null}
          onActivate={onActivate}
          onClose={close}
        />
      )}
      {/* Always mounted, so the terminal is never re-attached (P10). */}
      <div hidden={active !== undefined} style={{height: '100%', minHeight: 0}}>
        <SessionPanel
          worktree={worktree}
          snapshot={session.snapshot}
          activeSessionName={session.activeSessionName}
          theme={theme}
          onStart={session.onStart}
          onKill={session.onKill}
          onSelectSession={session.onSelectSession}
        />
      </div>
      {worktree && active && (
        <div style={{height: '100%', minHeight: 0}}>
          <EditorPanel
            file={active}
            worktreePath={worktree.path}
            theme={theme}
            saving={saving}
            diskMtime={mtimes[active.path]}
            onDirty={dirty => onDirty(active.path, dirty)}
            onSave={text => onSave(active.path, text)}
            onReload={() => onReload(active.path)}
            onKeep={mtimeMs => onKeep(active.path, mtimeMs)}
            onOpenInEditor={onOpenInEditor}
            editorRef={editorRef}
          />
        </div>
      )}
    </div>
  );
};
