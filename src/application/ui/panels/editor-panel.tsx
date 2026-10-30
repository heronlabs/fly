import type {CSSProperties, RefObject} from 'react';

import {CodeEditor, type CodeEditorHandle} from '../editor/code-editor';
import {fileKind} from '../editor/file-kinds';
import type {OpenFile} from '../state/fly-store';
import type {ResolvedTheme} from '../theme/theme';

type Props = {
  file: OpenFile;
  theme: ResolvedTheme;
  saving: boolean;
  diskMtime: number | null | undefined;
  onDirty(dirty: boolean): void;
  onSave(text: string): void;
  onReload(): void;
  onKeep(mtimeMs: number | null): void;
  editorRef: RefObject<CodeEditorHandle | null>;
};

const buttonStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 10px',
  cursor: 'pointer',
};

const barStyle: CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 14px',
  borderBottom: '1px solid var(--border)',
  background: 'color-mix(in srgb, var(--warn) 12%, var(--deep))',
  color: 'var(--text2)',
};

const statusOf = (file: OpenFile, saving: boolean) =>
  saving
    ? {label: 'Salvando…', color: 'var(--muted)'}
    : file.dirty
      ? {label: 'Modificado', color: 'var(--warn)'}
      : {label: 'Salvo', color: 'var(--faint)'};

export const EditorPanel = ({
  file,
  theme,
  saving,
  diskMtime,
  onDirty,
  onSave,
  onReload,
  onKeep,
  editorRef,
}: Props) => {
  const {content} = file;
  const kind = fileKind(file.path.split('/').pop() ?? file.path);
  const status = statusOf(file, saving);
  // A clean tab saves only to re-create its missing file (P8).
  const saveable = file.dirty || file.diskState === 'missing';
  const save = () => {
    const text = editorRef.current?.getText() ?? null;
    if (text !== null) onSave(text);
  };

  return (
    <section
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--page)',
      }}
    >
      <header
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 14px',
          background: 'var(--deep)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--fontMono)',
            fontSize: 11.5,
            color: 'var(--muted)',
          }}
        >
          {file.path}
        </span>
        {content.kind === 'text' && (
          <>
            <span style={{fontSize: 11.5, color: status.color}}>
              {status.label}
            </span>
            <button
              type="button"
              aria-keyshortcuts="Meta+S"
              disabled={!saveable || saving}
              onClick={save}
              style={buttonStyle}
            >
              Salvar{' '}
              <span aria-hidden="true" style={{color: 'var(--faint)'}}>
                ⌘S
              </span>
            </button>
          </>
        )}
      </header>
      {file.diskState === 'changed' && (
        <div role="alert" style={barStyle}>
          <span style={{flex: 1}}>Arquivo alterado no disco</span>
          <button type="button" onClick={onReload} style={buttonStyle}>
            Recarregar
          </button>
          <button
            type="button"
            onClick={() => onKeep(diskMtime ?? null)}
            style={buttonStyle}
          >
            Manter
          </button>
        </div>
      )}
      {file.diskState === 'missing' && (
        <div role="alert" style={barStyle}>
          Arquivo removido do disco
        </div>
      )}
      {content.kind === 'text' ? (
        <>
          <div style={{flex: 1, minHeight: 0}}>
            <CodeEditor
              stateKey={`${file.worktreeId}\0${file.path}`}
              text={content.text}
              revision={file.revision}
              kind={kind}
              theme={theme}
              onDirty={onDirty}
              editorRef={editorRef}
            />
          </div>
          <footer
            style={{
              flex: 'none',
              padding: '3px 14px',
              background: 'var(--deep)',
              borderTop: '1px solid var(--border)',
              fontFamily: 'var(--fontMono)',
              fontSize: 11,
              color: 'var(--faint)',
            }}
          >
            {`${kind.name} · UTF-8 · ${content.eol === 'crlf' ? 'CRLF' : 'LF'} · ${content.text.split('\n').length} linhas`}
          </footer>
        </>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--muted)',
          }}
        >
          <p style={{margin: 0}}>
            {content.kind === 'binary'
              ? 'Arquivo binário'
              : `Arquivo grande (${Math.round(content.bytes / 1000)} KB)`}
          </p>
        </div>
      )}
    </section>
  );
};
