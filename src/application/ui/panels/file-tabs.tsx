import {MenuOutlined} from '@ant-design/icons';
import {type CSSProperties, type ReactNode, useState} from 'react';

import {fileKind} from '../editor/file-kinds';
import type {OpenFile} from '../state/fly-store';

type Props = {
  explorerCollapsed: boolean;
  onOpenExplorer(): void;
  tabs: OpenFile[];
  activePath: string | null;
  onActivate(path: string | null): void;
  onClose(path: string): void;
};

const plain: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
};

const boxStyle = (active: boolean): CSSProperties => ({
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 34,
  padding: '0 10px 0 12px',
  boxSizing: 'border-box',
  borderRight: '1px solid var(--border)',
  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
  background: active ? 'var(--page)' : 'transparent',
  color: active ? 'var(--strong)' : 'var(--muted)',
  whiteSpace: 'nowrap',
});

const chipStyle = (color: string): CSSProperties => ({
  flex: 'none',
  width: 18,
  height: 14,
  borderRadius: 3,
  fontSize: 9,
  fontWeight: 600,
  lineHeight: '14px',
  textAlign: 'center',
  color,
  background: `color-mix(in srgb, ${color} 13%, transparent)`,
});

// A plain box around the tab: a role="tab" element's children are
// presentational, so the close button sits next to it, not inside.
const TabBox = ({
  active,
  label,
  onActivate,
  children,
}: {
  active: boolean;
  label: ReactNode;
  onActivate(): void;
  children?: ReactNode;
}) => (
  <div style={boxStyle(active)}>
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onActivate}
      style={{...plain, display: 'flex', alignItems: 'center', gap: 6}}
    >
      {label}
    </button>
    {children}
  </div>
);

const FileTab = ({
  file,
  active,
  onActivate,
  onClose,
}: {
  file: OpenFile;
  active: boolean;
  onActivate(): void;
  onClose(): void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const name = file.path.split('/').pop() ?? file.path;
  const kind = fileKind(name);

  if (confirming) {
    return (
      <div style={boxStyle(active)}>
        <button
          type="button"
          style={{...plain, color: 'var(--err)'}}
          onClick={() => {
            setConfirming(false);
            onClose();
          }}
        >
          Descartar
        </button>
        <button
          type="button"
          style={plain}
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <TabBox
      active={active}
      onActivate={onActivate}
      label={
        <>
          <span aria-hidden="true" style={chipStyle(kind.color)}>
            {kind.label}
          </span>
          <span style={{fontFamily: 'var(--fontMono)', fontSize: 12}}>
            {name}
          </span>
        </>
      }
    >
      <button
        type="button"
        aria-label={`Fechar ${name}`}
        title={`Fechar ${name}`}
        onClick={() => (file.dirty ? setConfirming(true) : onClose())}
        style={{
          ...plain,
          width: 16,
          textAlign: 'center',
          color: file.dirty ? 'var(--warn)' : 'var(--faint)',
        }}
      >
        {file.dirty ? '●' : '×'}
      </button>
    </TabBox>
  );
};

export const FileTabs = ({
  explorerCollapsed,
  onOpenExplorer,
  tabs,
  activePath,
  onActivate,
  onClose,
}: Props) => (
  <div
    role="tablist"
    style={{
      flex: 'none',
      display: 'flex',
      overflowX: 'auto',
      background: 'var(--drawer)',
      borderBottom: '1px solid var(--border)',
    }}
  >
    {explorerCollapsed && (
      <button
        type="button"
        aria-label="Abrir explorer"
        title="Abrir explorer"
        onClick={onOpenExplorer}
        style={{
          ...plain,
          flex: 'none',
          width: 36,
          borderRight: '1px solid var(--border)',
          color: 'var(--muted)',
        }}
      >
        <MenuOutlined />
      </button>
    )}
    <TabBox
      active={activePath === null}
      label="Sessão"
      onActivate={() => onActivate(null)}
    />
    {tabs.map(file => (
      // Worktrees of one repo share paths: a path-only key would hand an
      // open Descartar prompt to the other worktree's tab.
      <FileTab
        key={`${file.worktreeId}\0${file.path}`}
        file={file}
        active={file.path === activePath}
        onActivate={() => onActivate(file.path)}
        onClose={() => onClose(file.path)}
      />
    ))}
  </div>
);
