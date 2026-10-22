import {
  FolderOpenOutlined,
  FolderOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useState,
} from 'react';

import type {FileFlag} from '../../../core/domain/files';
import type {Worktree} from '../../../core/domain/workspace';
import {fileKind} from '../editor/file-kinds';
import {changedDirs, type ExplorerTree} from '../state/fly-store';

type Props = {
  worktree: Worktree;
  repoName: string;
  tree: ExplorerTree | undefined;
  flags: Record<string, FileFlag>;
  error: string | null;
  activePath: string | null;
  onToggleDir(dir: string): void;
  onOpenFile(path: string): void;
  onClose(): void;
};

type Level = {
  tree: ExplorerTree;
  flags: Record<string, FileFlag>;
  changed: Set<string>;
  activePath: string | null;
  onToggleDir(dir: string): void;
  onOpenFile(path: string): void;
};

const INDENT = 14;

const indentOf = (level: number): number => 8 + (level - 1) * INDENT;

const childPath = (dir: string, name: string): string =>
  dir === '' ? name : `${dir}/${name}`;

const rowText: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 26,
  fontFamily: 'var(--fontMono)',
  fontSize: 12,
};

const nameStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

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

const TreeRow = ({
  level,
  expanded,
  selected,
  onActivate,
  children,
}: {
  level: number;
  expanded?: boolean;
  selected?: boolean;
  onActivate(): void;
  children: ReactNode;
}) => {
  const [hover, setHover] = useState(false);
  const activate = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };
  return (
    <div
      role="treeitem"
      aria-level={level}
      aria-expanded={expanded}
      aria-selected={selected}
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={activate}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...rowText,
        paddingLeft: indentOf(level),
        paddingRight: 10,
        cursor: 'pointer',
        color: selected ? 'var(--strong)' : 'var(--text2)',
        backgroundColor: selected
          ? 'var(--active)'
          : hover
            ? 'var(--surface)'
            : undefined,
      }}
    >
      {children}
    </div>
  );
};

// Flat rows with aria-level: a directory's children follow it when expanded.
const rowsOf = (props: Level, dir: string, level: number): ReactNode[] => {
  const {tree, flags, changed, activePath, onToggleDir, onOpenFile} = props;
  const entries = tree.entries[dir];
  if (!entries) return [];
  // Deleted paths are not on disk; the Diff panel shows them (P5).
  const visible = entries.filter(
    entry => flags[childPath(dir, entry.name)] !== 'D',
  );
  if (visible.length === 0) {
    return [
      <div
        key={`${dir}\0`}
        style={{
          ...rowText,
          paddingLeft: indentOf(level) + 18,
          color: 'var(--faint)',
        }}
      >
        Vazio
      </div>,
    ];
  }
  return visible.flatMap(entry => {
    const path = childPath(dir, entry.name);
    if (entry.kind === 'file') {
      const kind = fileKind(entry.name);
      const flag = flags[path];
      return [
        <TreeRow
          key={path}
          level={level}
          selected={path === activePath}
          onActivate={() => onOpenFile(path)}
        >
          <span aria-hidden="true" style={{flex: 'none', width: 12}} />
          <span aria-hidden="true" style={chipStyle(kind.color)}>
            {kind.label}
          </span>
          <span style={nameStyle}>{entry.name}</span>
          {flag && (
            <span
              style={{
                marginLeft: 'auto',
                flex: 'none',
                fontWeight: 600,
                color: flag === 'A' ? 'var(--ok)' : 'var(--warn)',
              }}
            >
              {flag}
            </span>
          )}
        </TreeRow>,
      ];
    }
    const expanded = tree.expanded[path] === true;
    const Folder = expanded ? FolderOpenOutlined : FolderOutlined;
    return [
      <TreeRow
        key={path}
        level={level}
        expanded={expanded}
        onActivate={() => onToggleDir(path)}
      >
        <RightOutlined
          aria-hidden="true"
          style={{
            flex: 'none',
            width: 12,
            justifyContent: 'center',
            fontSize: 9,
            color: 'var(--faint)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 120ms',
          }}
        />
        <Folder aria-hidden="true" style={{color: 'var(--info)'}} />
        <span style={nameStyle}>{entry.name}</span>
        {changed.has(path) && (
          <span
            aria-hidden="true"
            data-testid="changed-dot"
            style={{
              flex: 'none',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--warn)',
            }}
          />
        )}
      </TreeRow>,
      ...(expanded ? rowsOf(props, path, level + 1) : []),
    ];
  });
};

export const ExplorerPanel = ({
  worktree,
  repoName,
  tree,
  flags,
  error,
  activePath,
  onToggleDir,
  onOpenFile,
  onClose,
}: Props) => {
  const titleId = useId();
  return (
    <nav
      aria-label="Explorer"
      style={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--drawer)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 4px 2px 14px',
        }}
      >
        <span
          id={titleId}
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: 'var(--faint)',
          }}
        >
          Explorer
        </span>
        <span
          style={{
            fontSize: 10,
            padding: '0 6px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          {`${Object.keys(flags).length} alterados`}
        </span>
        <button
          type="button"
          aria-label="Fechar explorer"
          title="Fechar explorer"
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 0,
            padding: '4px 10px',
            cursor: 'pointer',
            color: 'var(--muted)',
          }}
        >
          <LeftOutlined />
        </button>
      </div>
      <div
        style={{
          ...nameStyle,
          padding: '0 14px 6px',
          fontFamily: 'var(--fontMono)',
          fontSize: 11.5,
          color: 'var(--muted)',
        }}
      >
        {`${repoName} · ${worktree.branch ?? worktree.head.slice(0, 7)}`}
      </div>
      {error && (
        <div
          style={{
            padding: '0 14px 6px',
            fontSize: 11,
            overflowWrap: 'anywhere',
            color: 'var(--muted)',
          }}
        >
          {error}
        </div>
      )}
      <div
        role="tree"
        aria-labelledby={titleId}
        style={{flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 8}}
      >
        {tree &&
          rowsOf(
            {
              tree,
              flags,
              changed: changedDirs(flags),
              activePath,
              onToggleDir,
              onOpenFile,
            },
            '',
            1,
          )}
      </div>
    </nav>
  );
};
