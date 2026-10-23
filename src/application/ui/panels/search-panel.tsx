import {FolderOutlined, LeftOutlined} from '@ant-design/icons';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  SearchMatch,
  SearchQuery,
  SearchRange,
} from '../../../core/domain/search';
import type {Worktree} from '../../../core/domain/workspace';
import {fileKind} from '../editor/file-kinds';
import {SEARCH_DEBOUNCE_MS, type WorktreeSearch} from '../state/fly-store';

type Props = {
  worktree: Worktree;
  repoName: string;
  search: WorktreeSearch | undefined;
  // Each change focuses the input and selects its text.
  focusKey: number;
  onSearch(query: SearchQuery): void;
  onOpenMatch(path: string, match: SearchMatch): void;
  onShowExplorer(): void;
  onClose(): void;
};

type Toggle = 'caseSensitive' | 'wholeWord' | 'regex';

const emptyQuery: SearchQuery = {
  text: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
};

const toggles: {key: Toggle; label: string; glyph: ReactNode}[] = [
  {key: 'caseSensitive', label: 'Diferenciar maiúsculas', glyph: 'Aa'},
  {
    key: 'wholeWord',
    label: 'Palavra inteira',
    glyph: <span style={{textDecoration: 'underline'}}>ab</span>,
  },
  {key: 'regex', label: 'Expressão regular', glyph: '.*'},
];

const headerButton: CSSProperties = {
  background: 'none',
  border: 0,
  padding: '4px 6px',
  cursor: 'pointer',
  color: 'var(--muted)',
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

const counted = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

// A failed search has no result: its error shows instead.
const statusOf = (search: WorktreeSearch | undefined): string | null => {
  if (search?.searching) return 'Buscando…';
  const result = search?.result;
  if (!result) return null;
  return result.total === 0
    ? 'Nenhum resultado'
    : `${counted(result.total, 'resultado', 'resultados')} em ${counted(result.files.length, 'arquivo', 'arquivos')}`;
};

const Highlighted = ({
  text,
  highlights,
}: {
  text: string;
  highlights: SearchRange[];
}) => {
  const parts: ReactNode[] = [];
  let at = 0;
  highlights.forEach(([start, end], index) => {
    parts.push(
      text.slice(at, start),
      <mark
        key={index}
        style={{
          background: 'var(--edFindMatchOther)',
          color: 'inherit',
          borderRadius: 2,
        }}
      >
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  parts.push(text.slice(at));
  return <>{parts}</>;
};

const MatchRow = ({match, onOpen}: {match: SearchMatch; onOpen(): void}) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        gap: 8,
        width: '100%',
        minHeight: 22,
        alignItems: 'center',
        padding: '0 10px 0 32px',
        border: 0,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'var(--fontMono)',
        fontSize: 12,
        color: 'var(--text2)',
        backgroundColor: hover ? 'var(--surface)' : 'transparent',
      }}
    >
      <span style={{flex: 'none', color: 'var(--faint)'}}>{match.line}</span>
      <span style={{...nameStyle, whiteSpace: 'pre'}}>
        <Highlighted text={match.preview} highlights={match.highlights} />
      </span>
    </button>
  );
};

export const SearchPanel = ({
  worktree,
  repoName,
  search,
  focusKey,
  onSearch,
  onOpenMatch,
  onShowExplorer,
  onClose,
}: Props) => {
  // The input follows the selected worktree's last query; a switch while
  // typing lets the pending search finish on the worktree it was typed in.
  const [shown, setShown] = useState({
    worktreeId: worktree.id,
    query: search?.query ?? emptyQuery,
  });
  if (shown.worktreeId !== worktree.id) {
    setShown({worktreeId: worktree.id, query: search?.query ?? emptyQuery});
  }
  const {query} = shown;
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusKey]);

  const run = (next: SearchQuery, delay: number) => {
    setShown({worktreeId: worktree.id, query: next});
    clearTimeout(timer.current);
    if (delay === 0) onSearch(next);
    else timer.current = setTimeout(() => onSearch(next), delay);
  };

  const result = search?.result ?? null;
  const status = statusOf(search);

  return (
    <nav
      aria-label="Busca"
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
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: 'var(--faint)',
          }}
        >
          Buscar
        </span>
        <button
          type="button"
          aria-label="Mostrar explorer"
          title="Mostrar explorer"
          onClick={onShowExplorer}
          style={{...headerButton, marginLeft: 'auto'}}
        >
          <FolderOutlined />
        </button>
        <button
          type="button"
          aria-label="Fechar busca"
          title="Fechar busca"
          onClick={onClose}
          style={{...headerButton, padding: '4px 10px'}}
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          margin: '0 10px 6px',
          padding: '0 2px 0 6px',
          border: '1px solid var(--border)',
          borderRadius: 4,
          background: 'var(--page)',
        }}
      >
        <input
          ref={input}
          aria-label="Buscar"
          placeholder="Buscar"
          spellCheck={false}
          value={query.text}
          onChange={event =>
            run({...query, text: event.target.value}, SEARCH_DEBOUNCE_MS)
          }
          onKeyDown={event => {
            if (event.key === 'Enter') run(query, 0);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '4px 0',
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontFamily: 'var(--fontMono)',
            fontSize: 12,
          }}
        />
        {toggles.map(({key, label, glyph}) => (
          <button
            key={key}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={query[key]}
            onClick={() => run({...query, [key]: !query[key]}, 0)}
            style={{
              flex: 'none',
              width: 22,
              height: 20,
              padding: 0,
              border: `1px solid ${query[key] ? 'var(--accent)' : 'transparent'}`,
              borderRadius: 3,
              cursor: 'pointer',
              fontFamily: 'var(--fontMono)',
              fontSize: 11,
              color: query[key] ? 'var(--strong)' : 'var(--muted)',
              background: query[key] ? 'var(--active)' : 'transparent',
            }}
          >
            {glyph}
          </button>
        ))}
      </div>
      {search?.error && (
        <div
          role="alert"
          style={{
            padding: '0 14px 6px',
            fontSize: 11,
            overflowWrap: 'anywhere',
            color: 'var(--err)',
          }}
        >
          {search.error}
        </div>
      )}
      {status && (
        <div
          style={{padding: '0 14px 6px', fontSize: 11, color: 'var(--muted)'}}
        >
          {status}
        </div>
      )}
      {result?.truncated && !search?.searching && (
        <div
          style={{padding: '0 14px 6px', fontSize: 11, color: 'var(--warn)'}}
        >
          Resultados limitados; refine a busca
        </div>
      )}
      <div
        role="list"
        aria-label="Resultados"
        style={{flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: 8}}
      >
        {result?.files.map(file => {
          const slash = file.path.lastIndexOf('/');
          const name = file.path.slice(slash + 1);
          const kind = fileKind(name);
          return (
            <div key={file.path} role="listitem" aria-label={file.path}>
              <div
                title={file.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 24,
                  padding: '0 10px 0 14px',
                  fontFamily: 'var(--fontMono)',
                  fontSize: 12,
                  color: 'var(--text2)',
                }}
              >
                <span aria-hidden="true" style={chipStyle(kind.color)}>
                  {kind.label}
                </span>
                <span style={{...nameStyle, flex: 'none', maxWidth: '60%'}}>
                  {name}
                </span>
                <span style={{...nameStyle, color: 'var(--faint)'}}>
                  {slash === -1 ? '' : file.path.slice(0, slash)}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    flex: 'none',
                    fontSize: 10,
                    padding: '0 6px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
                >
                  {file.matches.length}
                </span>
              </div>
              {file.matches.map(match => (
                <MatchRow
                  key={match.line}
                  match={match}
                  onOpen={() => onOpenMatch(file.path, match)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </nav>
  );
};
