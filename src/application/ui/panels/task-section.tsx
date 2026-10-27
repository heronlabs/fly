import {type CSSProperties, useState} from 'react';

import type {WorktreeQueue} from '../../../core/domain/queue';

type Props = {
  queue: WorktreeQueue | null;
  onOpenPr(): Promise<void>;
};

const buttonStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '2px 10px',
  cursor: 'pointer',
};

const errorStyle: CSSProperties = {color: 'var(--err)'};

export const TaskSection = ({queue, onOpenPr}: Props) => {
  const [sending, setSending] = useState(false);
  const [rejection, setRejection] = useState<{
    message: string;
    state: string;
  } | null>(null);
  if (!queue) return null;
  const {task, canOpenPr} = queue;
  // A rejection belongs to the state it happened in; a new state drops it.
  const state = `${canOpenPr}|${task?.phase}|${task?.stop?.message}`;
  const failure = rejection?.state === state ? rejection.message : null;
  const open = async () => {
    setSending(true);
    setRejection(null);
    try {
      await onOpenPr();
    } catch (error) {
      setRejection({
        message: error instanceof Error ? error.message : String(error),
        state,
      });
    } finally {
      setSending(false);
    }
  };
  const opening = task?.phase === 'opening';
  if (!canOpenPr && !opening && !task?.stop && failure === null) return null;
  return (
    <section style={{marginBottom: 12}}>
      {canOpenPr && (
        <button
          type="button"
          style={buttonStyle}
          disabled={sending}
          onClick={() => void open()}
        >
          Abrir PR
        </button>
      )}
      {opening && (
        <div style={{color: 'var(--muted)'}}>
          Abrindo PR: aguardando a sessão commitar e escrever o PR…
        </div>
      )}
      {task?.stop && <div style={errorStyle}>{task.stop.message}</div>}
      {failure !== null && <div style={errorStyle}>{failure}</div>}
    </section>
  );
};
