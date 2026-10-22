import {type CSSProperties, useState} from 'react';

import type {
  CheckRun,
  PullRequest,
  QueueStatus,
  WorktreeQueue,
} from '../../../core/domain/queue';
import type {ReceiptResult} from '../../../core/domain/transcript';

type Props = {
  queue: WorktreeQueue | null;
  status: QueueStatus;
  merging: boolean;
  onMerge(): void;
  onOpenExternal(url: string): void;
};

const buttonStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 10px',
  cursor: 'pointer',
};

const heading: CSSProperties = {
  margin: '12px 0 4px',
  fontSize: 12,
  color: 'var(--muted)',
  fontWeight: 600,
};

const checkWord: Record<CheckRun['state'], string> = {
  passing: 'ok',
  pending: 'rodando',
  failing: 'falhou',
};

const reviewWord: Record<PullRequest['review'], string> = {
  approved: 'aprovado',
  'changes-requested': 'mudanças pedidas',
  required: 'pendente',
  none: 'não exigido',
};

const pillBackground = (pr: PullRequest): string =>
  pr.state === 'merged'
    ? 'var(--badgeMerged)'
    : pr.state === 'closed'
      ? 'var(--badgeErr)'
      : pr.draft
        ? 'var(--badgeWarn)'
        : 'var(--badgeOk)';

const Receipt = ({receipt}: {receipt: ReceiptResult}) => {
  if (receipt.kind === 'invalid') {
    return (
      <section>
        <h3 style={{...heading, color: 'var(--err)'}}>Receipt inválido</h3>
        <ul style={{margin: 0, paddingLeft: 18}}>
          {receipt.problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      </section>
    );
  }
  const {summary, filesChanged, verification} = receipt.receipt;
  return (
    <section>
      <h3 style={heading}>Receipt do engineer</h3>
      <p style={{margin: 0}}>{summary}</p>
      <h3 style={heading}>Arquivos</h3>
      <ul style={{margin: 0, paddingLeft: 18, fontFamily: 'var(--fontMono)'}}>
        {filesChanged.map(path => (
          <li key={path}>{path}</li>
        ))}
      </ul>
      <h3 style={heading}>Verificação</h3>
      {Object.entries(verification).map(([gate, result]) => (
        <div key={gate} style={{fontFamily: 'var(--fontMono)'}}>
          {`${gate}: ${result}`}
        </div>
      ))}
    </section>
  );
};

const PullRequestSection = ({
  pr,
  status,
  merging,
  onMerge,
  onOpenExternal,
}: Omit<Props, 'queue'> & {pr: PullRequest}) => {
  const [confirming, setConfirming] = useState(false);
  return (
    <section>
      <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
        <button
          type="button"
          style={{...buttonStyle, flex: 1, textAlign: 'left'}}
          onClick={() => onOpenExternal(pr.url)}
        >
          {`#${pr.number} ${pr.title}`}
        </button>
        <span
          style={{
            backgroundColor: pillBackground(pr),
            color: '#fff',
            borderRadius: 10,
            padding: '1px 8px',
          }}
        >
          {pr.draft ? `${pr.state} draft` : pr.state}
        </span>
      </div>
      <h3 style={heading}>Checks</h3>
      {pr.checkRuns.map(run => (
        <div
          key={run.name}
          style={{display: 'flex', gap: 8, alignItems: 'center'}}
        >
          <span style={{flex: 1}}>{run.name}</span>
          <span style={{color: 'var(--muted)'}}>{checkWord[run.state]}</span>
          {run.url !== null && (
            <button
              type="button"
              aria-label={`Abrir ${run.name}`}
              style={buttonStyle}
              onClick={() => onOpenExternal(run.url ?? '')}
            >
              ↗
            </button>
          )}
        </div>
      ))}
      <h3 style={heading}>Review</h3>
      <div>{reviewWord[pr.review]}</div>
      <div style={{marginTop: 12, display: 'flex', gap: 8}}>
        {pr.state === 'merged' ? (
          <span style={{color: 'var(--muted)'}}>Merge feito</span>
        ) : pr.state === 'open' && confirming ? (
          <>
            <button
              type="button"
              style={{...buttonStyle, color: 'var(--err)'}}
              disabled={status !== 'ready' || merging}
              onClick={() => {
                setConfirming(false);
                onMerge();
              }}
            >
              Confirmar
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </>
        ) : pr.state === 'open' ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={status !== 'ready' || merging}
            onClick={() => setConfirming(true)}
          >
            Fazer merge
          </button>
        ) : null}
      </div>
    </section>
  );
};

export const PrView = ({queue, ...props}: Props) => (
  <div
    style={{
      height: '100%',
      overflowY: 'auto',
      padding: '10px 14px',
      background: 'var(--surface)',
      color: 'var(--text2)',
    }}
  >
    {queue?.pullRequest ? (
      <PullRequestSection
        key={queue.pullRequest.url}
        pr={queue.pullRequest}
        {...props}
      />
    ) : (
      <div style={{color: 'var(--muted)'}}>Sem PR aberto</div>
    )}
    {queue?.receipt && <Receipt receipt={queue.receipt} />}
  </div>
);
