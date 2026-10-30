import type {CSSProperties} from 'react';

import type {DiffFile, DiffLine, WorktreeDiff} from '../../../core/domain/diff';

type Props = {
  diff: WorktreeDiff | null;
};

const scroller: CSSProperties = {
  height: '100%',
  overflowY: 'auto',
  background: 'var(--surface)',
  fontFamily: 'var(--fontMono)',
  fontSize: 12,
};

const note: CSSProperties = {padding: '10px 14px', color: 'var(--muted)'};

const lineStyle = (line: DiffLine): CSSProperties =>
  line.kind === 'add'
    ? {backgroundColor: 'var(--diffAddBg)'}
    : line.kind === 'del'
      ? {backgroundColor: 'var(--diffDelBg)', color: 'var(--diffDelFg)'}
      : {};

const gutter: CSSProperties = {
  display: 'inline-block',
  minWidth: 36,
  padding: '0 6px',
  textAlign: 'right',
  color: 'var(--faint)',
  userSelect: 'none',
};

const FileBody = ({file}: {file: DiffFile}) => {
  if (file.binary) return <div style={note}>Arquivo binário</div>;
  if (file.truncated && file.lines > 0) {
    return <div style={note}>Arquivo grande ({file.lines} linhas)</div>;
  }
  return (
    <>
      {file.hunks.map((hunk, hunkIndex) => (
        <pre key={hunkIndex} style={{margin: 0}}>
          <div style={{color: 'var(--muted)', padding: '2px 6px'}}>
            {hunk.header}
          </div>
          {hunk.lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              data-kind={line.kind}
              style={{whiteSpace: 'pre', ...lineStyle(line)}}
            >
              <span style={gutter}>{line.oldNo ?? ''}</span>
              <span style={gutter}>{line.newNo ?? ''}</span>
              <span>{line.text}</span>
            </div>
          ))}
        </pre>
      ))}
    </>
  );
};

export const DiffView = ({diff}: Props) => {
  if (diff === null) return <div style={scroller} />;
  if (diff.error !== null) {
    return (
      <div style={scroller}>
        <div role="alert" style={{...note, color: 'var(--err)'}}>
          {diff.error}
        </div>
      </div>
    );
  }
  if (diff.diff === null) {
    return (
      <div style={scroller}>
        <div style={note}>Este é o worktree principal</div>
      </div>
    );
  }
  const {files, truncated} = diff.diff;
  return (
    <div style={scroller}>
      {truncated && <div style={note}>Diff truncado</div>}
      {files.length === 0 && <div style={note}>Sem alterações</div>}
      {files.map(file => (
        <section key={file.path}>
          <header
            style={{
              display: 'flex',
              gap: 8,
              padding: '4px 14px',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text2)',
            }}
          >
            <span style={{color: 'var(--muted)'}}>{file.status}</span>
            <span style={{flex: 1}}>{file.path}</span>
            {file.oldPath !== null && (
              <span style={{color: 'var(--muted)'}}>
                renomeado de {file.oldPath}
              </span>
            )}
            <span>{`+${file.additions} −${file.deletions}`}</span>
          </header>
          <FileBody file={file} />
        </section>
      ))}
    </div>
  );
};
