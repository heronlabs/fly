import {MenuOutlined} from '@ant-design/icons';
import {
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

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

const MENU_WIDTH = 160;

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
  ...mouse
}: {
  active: boolean;
  label: ReactNode;
  onActivate(): void;
  children?: ReactNode;
} & Pick<
  HTMLAttributes<HTMLDivElement>,
  'onMouseDown' | 'onAuxClick' | 'onContextMenu'
>) => (
  <div {...mouse} style={boxStyle(active)}>
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
  onMenu,
}: {
  file: OpenFile;
  active: boolean;
  onActivate(): void;
  onClose(): void;
  onMenu(event: MouseEvent): void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const name = file.path.split('/').pop() ?? file.path;
  const kind = fileKind(name);
  const close = () => (file.dirty ? setConfirming(true) : onClose());

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
      // The middle button closes like the ×; its mousedown would autoscroll.
      onMouseDown={event => event.button === 1 && event.preventDefault()}
      onAuxClick={event => event.button === 1 && close()}
      onContextMenu={onMenu}
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
        onClick={close}
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

const MenuItem = ({
  danger = false,
  autoFocus = false,
  onClick,
  children,
}: {
  danger?: boolean;
  autoFocus?: boolean;
  onClick(): void;
  children: ReactNode;
}) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      autoFocus={autoFocus}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        width: '100%',
        padding: '4px 10px',
        border: 0,
        borderRadius: 4,
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        color: danger ? 'var(--err)' : 'var(--text2)',
        backgroundColor: hover ? 'var(--surface)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
};

// A custom menu: the renderer has no Electron Menu. Kept inside the window,
// so a tab near the right edge cannot make the window scroll.
const TabMenu = ({
  x,
  y,
  dirty,
  onCloseAll,
  onCloseSaved,
  onDismiss,
}: {
  x: number;
  y: number;
  dirty: boolean;
  onCloseAll(): void;
  onCloseSaved(): void;
  onDismiss(): void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    // Capture: a click that the terminal or the editor stops still dismisses.
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Abas"
      style={{
        position: 'fixed',
        left: Math.min(x, window.innerWidth - MENU_WIDTH),
        top: y,
        zIndex: 10,
        width: MENU_WIDTH,
        boxSizing: 'border-box',
        padding: 4,
        background: 'var(--drawer)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      {confirming ? (
        <>
          <MenuItem danger onClick={onCloseAll}>
            Descartar
          </MenuItem>
          <MenuItem onClick={onDismiss}>Cancelar</MenuItem>
        </>
      ) : (
        <>
          <MenuItem
            autoFocus
            onClick={dirty ? () => setConfirming(true) : onCloseAll}
          >
            Fechar todas
          </MenuItem>
          <MenuItem onClick={onCloseSaved}>Fechar salvas</MenuItem>
        </>
      )}
    </div>
  );
};

export const FileTabs = ({
  explorerCollapsed,
  onOpenExplorer,
  tabs,
  activePath,
  onActivate,
  onClose,
}: Props) => {
  const [menu, setMenu] = useState<{x: number; y: number} | null>(null);
  const openMenu = (event: MouseEvent) => {
    event.preventDefault();
    setMenu({x: event.clientX, y: event.clientY});
  };
  const closeEach = (files: OpenFile[]) => {
    setMenu(null);
    for (const file of files) onClose(file.path);
  };

  return (
    <>
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
            onMenu={openMenu}
          />
        ))}
      </div>
      {menu && (
        <TabMenu
          x={menu.x}
          y={menu.y}
          dirty={tabs.some(file => file.dirty)}
          onCloseAll={() => closeEach(tabs)}
          onCloseSaved={() => closeEach(tabs.filter(file => !file.dirty))}
          onDismiss={() => setMenu(null)}
        />
      )}
    </>
  );
};
