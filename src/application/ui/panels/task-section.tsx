import {type CSSProperties, useState} from 'react';

import type {WorktreeQueue} from '../../../core/domain/queue';

type Props = {
  queue: WorktreeQueue | null;
  onOpenPr(): Promise<void>;
  onRerun(): Promise<void>;
  onResume(): Promise<void>;
  onClean(confirmed: boolean): Promise<void>;
};

const buttonStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 10px',
  cursor: 'pointer',
};

// MAX_CI_ATTEMPTS of core/domain/task, which the renderer may only import as a type.
const MAX_CI_ATTEMPTS = 3;

const errorStyle: CSSProperties = {color: 'var(--err)'};
const mutedStyle: CSSProperties = {color: 'var(--muted)'};
const rowStyle: CSSProperties = {display: 'flex', gap: 8, marginTop: 4};

const reviewText = (
  review: NonNullable<NonNullable<WorktreeQueue['task']>['review']>,
): string =>
  review.state === 'queued'
    ? `${review.count} comentários de review novos`
    : review.state === 'sent'
      ? 'Encaminhando comentários de review…'
      : 'Comentários encaminhados à sessão';

export const TaskSection = ({
  queue,
  onOpenPr,
  onRerun,
  onResume,
  onClean,
}: Props) => {
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejection, setRejection] = useState<{
    message: string;
    state: string;
  } | null>(null);
  if (!queue) return null;
  const {task, canOpenPr, pullRequest} = queue;
  const prState = pullRequest?.state;
  // A rejection belongs to the state it happened in; a new state drops it.
  const state = `${canOpenPr}|${task?.phase}|${task?.stop?.message}|${prState}`;
  const failure = rejection?.state === state ? rejection.message : null;
  const run = async (action: () => Promise<void>) => {
    setSending(true);
    setRejection(null);
    try {
      await action();
    } catch (error) {
      setRejection({
        message: error instanceof Error ? error.message : String(error),
        state,
      });
    } finally {
      setSending(false);
    }
  };
  const button = (label: string, action: () => void) => (
    <button
      type="button"
      style={buttonStyle}
      disabled={sending}
      onClick={action}
    >
      {label}
    </button>
  );
  const opening = task?.phase === 'opening';
  const fixing = task?.phase === 'fixing';
  const counting = !fixing && (task?.ciAttempts ?? 0) > 0;
  const cleanable = prState === 'merged' || prState === 'closed';
  const asking = confirming && prState === 'closed';
  if (
    !canOpenPr &&
    !opening &&
    !fixing &&
    !counting &&
    !task?.stop &&
    !task?.review &&
    !cleanable &&
    failure === null
  ) {
    return null;
  }
  return (
    <section style={{marginBottom: 12}}>
      {canOpenPr && button('Abrir PR', () => void run(onOpenPr))}
      {opening && (
        <div style={mutedStyle}>
          Abrindo PR: aguardando a sessão commitar e escrever o PR…
        </div>
      )}
      {fixing && (
        <div style={mutedStyle}>
          {`Corrigindo a CI (tentativa ${task.ciAttempts} de ${MAX_CI_ATTEMPTS})`}
        </div>
      )}
      {counting && (
        <div style={mutedStyle}>
          {`Correções de CI: ${task?.ciAttempts} de ${MAX_CI_ATTEMPTS}`}
        </div>
      )}
      {task?.review && <div style={mutedStyle}>{reviewText(task.review)}</div>}
      {task?.stop && (
        <>
          <div style={errorStyle}>{task.stop.message}</div>
          <div style={rowStyle}>
            {task.stop.kind === 'infra' &&
              !!task.stop.runIds?.length &&
              button('Rodar de novo', () => void run(onRerun))}
            {button('Retomar', () => void run(onResume))}
          </div>
        </>
      )}
      {cleanable && !asking && (
        <div style={rowStyle}>
          {button('Limpar', () =>
            prState === 'closed'
              ? setConfirming(true)
              : void run(() => onClean(false)),
          )}
        </div>
      )}
      {asking && (
        <>
          <div>
            {`O PR #${pullRequest?.number} foi fechado sem merge. Apagar o worktree e o branch mesmo assim?`}
          </div>
          <div style={rowStyle}>
            <button
              type="button"
              style={{...buttonStyle, color: 'var(--err)'}}
              disabled={sending}
              onClick={() => {
                setConfirming(false);
                void run(() => onClean(true));
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
          </div>
        </>
      )}
      {failure !== null && <div style={errorStyle}>{failure}</div>}
    </section>
  );
};
