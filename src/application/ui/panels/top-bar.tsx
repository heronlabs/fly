import {
  CodeOutlined,
  FolderOpenOutlined,
  MoonOutlined,
  PlusOutlined,
  SunOutlined,
} from '@ant-design/icons';
import type {CSSProperties} from 'react';

import type {Worktree} from '../../../core/domain/workspace';
import logo from '../assets/logo.png';
import type {ResolvedTheme} from '../theme/theme';

type Props = {
  root: string | null;
  selected: Worktree | null;
  theme: ResolvedTheme;
  onToggleTheme(): void;
  onOpenFolder(): void;
  onOpenInEditor(): void;
  canCreateTask: boolean;
  onNewTask(): void;
};

const drag = {WebkitAppRegion: 'drag'} as CSSProperties;
const noDrag = {WebkitAppRegion: 'no-drag'} as CSSProperties;

const buttonStyle: CSSProperties = {
  ...noDrag,
  background: 'var(--surface)',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
};

export const TopBar = ({
  root,
  selected,
  theme,
  onToggleTheme,
  onOpenFolder,
  onOpenInEditor,
  canCreateTask,
  onNewTask,
}: Props) => (
  <header
    style={{
      ...drag,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      height: 44,
      padding: '0 14px 0 104px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--drawer)',
    }}
  >
    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
      <img src={logo} alt="" width={24} height={24} />
      <span
        style={{
          fontFamily: 'var(--fontDisplay)',
          fontSize: 16,
          lineHeight: 1,
          color: 'var(--strong)',
        }}
      >
        heronlabs
      </span>
    </div>
    <span
      style={{
        fontSize: 10,
        padding: '1px 8px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        color: 'var(--muted)',
      }}
    >
      {`v${__APP_VERSION__}`}
    </span>
    <span
      style={{flex: 1, color: 'var(--muted)', fontFamily: 'var(--fontMono)'}}
    >
      {selected
        ? `${selected.repoId.split('/').pop()} › ${selected.branch ?? selected.head.slice(0, 7)}`
        : root}
    </span>
    <button
      type="button"
      disabled={!canCreateTask}
      style={{...buttonStyle, opacity: canCreateTask ? 1 : 0.5}}
      onClick={onNewTask}
    >
      <PlusOutlined /> Nova tarefa
    </button>
    <button
      type="button"
      disabled={!selected}
      onClick={onOpenInEditor}
      style={{...buttonStyle, opacity: selected ? 1 : 0.5}}
    >
      <CodeOutlined /> Abrir no VSCode
    </button>
    <button
      type="button"
      aria-label="Alternar tema"
      onClick={onToggleTheme}
      style={buttonStyle}
    >
      {theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
    </button>
    <button type="button" onClick={onOpenFolder} style={buttonStyle}>
      <FolderOpenOutlined /> Abrir pasta
    </button>
  </header>
);
