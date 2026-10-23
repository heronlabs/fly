import '@xterm/xterm/css/xterm.css';

import {FitAddon} from '@xterm/addon-fit';
import {WebLinksAddon} from '@xterm/addon-web-links';
import {Terminal} from '@xterm/xterm';
import {useEffect, useRef, useState} from 'react';

import type {ResolvedTheme} from '../theme/theme';
import {terminalTheme} from './terminal-theme';

interface TerminalViewProps {
  sessionName: string;
  theme: ResolvedTheme;
  onExit?(exitCode: number): void;
}

// Backslash-escapes the way Terminal.app types a dropped path; non-ASCII stays.
const shellEscape = (path: string): string =>
  path.replace(/[^\w./,:@%+\u0080-\uffff-]/g, '\\$&');

// xterm's default opens links with window.open, which the main process denies.
const openLink = (url: string) => {
  window.fly.shell.openExternal(url).catch(() => undefined);
};

export const TerminalView = ({
  sessionName,
  theme,
  onExit,
}: TerminalViewProps) => {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  // Read when the terminal is created, so a theme change never re-attaches.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const [exited, setExited] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return undefined;
    }
    const api = window.fly.terminal;
    const attachments = window.fly.attachments;
    setExited(false);

    const xterm = new Terminal({
      fontFamily:
        "'JetBrains Mono', 'Symbols Nerd Font Mono', ui-monospace, monospace",
      fontSize: 13,
      cursorBlink: true,
      macOptionClickForcesSelection: true,
      scrollback: 1000,
      theme: terminalTheme(themeRef.current),
      linkHandler: {activate: (_event, text) => openLink(text)},
    });
    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.loadAddon(new WebLinksAddon((_event, uri) => openLink(uri)));
    xterm.open(element);
    fit.fit();
    term.current = xterm;

    let id: string | null = null;
    let disposed = false;
    let size = {cols: xterm.cols, rows: xterm.rows};
    // Events can beat the attach reply; keep them until our id is known.
    const early: Array<() => void> = [];

    const route = (eventId: string, run: () => void) => {
      if (id === null) {
        early.push(() => {
          if (eventId === id) {
            run();
          }
        });
      } else if (eventId === id) {
        run();
      }
    };

    const unData = api.onData((eventId, data) =>
      route(eventId, () => xterm.write(data)),
    );
    const unExit = api.onExit((eventId, code) =>
      route(eventId, () => {
        setExited(true);
        onExitRef.current?.(code);
      }),
    );
    const input = xterm.onData(data => {
      if (id !== null) {
        api.write(id, data);
      }
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
      if (
        id !== null &&
        (xterm.cols !== size.cols || xterm.rows !== size.rows)
      ) {
        size = {cols: xterm.cols, rows: xterm.rows};
        api.resize(id, size);
      }
    });
    observer.observe(element);

    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const paths = Array.from(event.dataTransfer?.files ?? [], file =>
        attachments.pathForFile(file),
      ).filter(path => path !== '');
      if (paths.length > 0) {
        xterm.paste(paths.map(shellEscape).join(' '));
      }
    };
    // Capture phase: an image-only paste never reaches xterm's own handler,
    // which would send an empty paste; any paste with text stays with xterm.
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data || data.getData('text/plain') !== '') {
        return;
      }
      const image = Array.from(data.files).find(
        file => file.type === 'image/png',
      );
      if (!image) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      image
        .arrayBuffer()
        .then(bytes => attachments.saveImage(new Uint8Array(bytes)))
        .then(
          path => {
            if (!disposed) {
              xterm.paste(shellEscape(path));
            }
          },
          () => undefined,
        );
    };
    element.addEventListener('dragover', onDragOver);
    element.addEventListener('drop', onDrop);
    element.addEventListener('paste', onPaste, true);

    api.attach(sessionName, size).then(
      attached => {
        if (disposed) {
          api.detach(attached).catch(() => undefined);
          return;
        }
        id = attached;
        early.splice(0).forEach(run => run());
        if (xterm.cols !== size.cols || xterm.rows !== size.rows) {
          size = {cols: xterm.cols, rows: xterm.rows};
          api.resize(attached, size);
        }
      },
      () => {
        if (!disposed) {
          early.length = 0;
          setExited(true);
        }
      },
    );

    return () => {
      disposed = true;
      unData();
      unExit();
      input.dispose();
      observer.disconnect();
      element.removeEventListener('dragover', onDragOver);
      element.removeEventListener('drop', onDrop);
      element.removeEventListener('paste', onPaste, true);
      if (id !== null) {
        api.detach(id).catch(() => undefined);
      }
      xterm.dispose();
      term.current = null;
    };
  }, [sessionName]);

  useEffect(() => {
    if (term.current) {
      term.current.options.theme = terminalTheme(theme);
    }
  }, [theme]);

  return (
    <div style={{position: 'relative', width: '100%', height: '100%'}}>
      <div ref={host} style={{width: '100%', height: '100%'}} />
      {exited && (
        <p
          role="status"
          style={{
            position: 'absolute',
            inset: 0,
            margin: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'color-mix(in srgb, var(--deep) 70%, transparent)',
            color: 'var(--text)',
            fontFamily: 'var(--fontBody)',
          }}
        >
          Sessão encerrada
        </p>
      )}
    </div>
  );
};
