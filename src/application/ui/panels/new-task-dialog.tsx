import {type CSSProperties, type KeyboardEvent, useState} from 'react';

import type {Repo} from '../../../core/domain/workspace';

type Props = {
  open: boolean;
  repos: Repo[];
  defaultRepoId: string | null;
  error?: string | null;
  onCancel(): void;
  onSubmit(input: {repoId: string; description: string}): void;
};

const fieldStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '6px 8px',
  font: 'inherit',
};

const buttonStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '4px 12px',
  cursor: 'pointer',
};

const DialogBody = ({
  repos,
  defaultRepoId,
  error,
  onCancel,
  onSubmit,
}: Omit<Props, 'open'>) => {
  const [repoId, setRepoId] = useState(defaultRepoId ?? repos[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const trimmed = description.trim();

  const submit = () => {
    if (trimmed) {
      onSubmit({repoId, description: trimmed});
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onCancel();
    } else if (event.key === 'Enter' && event.metaKey) {
      submit();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        onKeyDown={onKeyDown}
        style={{
          width: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 16,
          background: 'var(--drawer)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      >
        <h2
          id="new-task-title"
          style={{margin: 0, fontSize: 16, color: 'var(--strong)'}}
        >
          Nova tarefa
        </h2>
        <label style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          Repositório
          <select
            value={repoId}
            onChange={event => setRepoId(event.target.value)}
            style={fieldStyle}
          >
            {repos.map(repo => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          Descrição
          <textarea
            autoFocus
            rows={5}
            value={description}
            onChange={event => setDescription(event.target.value)}
            style={{...fieldStyle, resize: 'vertical'}}
          />
        </label>
        {error && (
          <p role="alert" style={{margin: 0, color: 'var(--err)'}}>
            {error}
          </p>
        )}
        <div style={{display: 'flex', justifyContent: 'flex-end', gap: 8}}>
          <button type="button" onClick={onCancel} style={buttonStyle}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={submit}
            style={{...buttonStyle, opacity: trimmed ? 1 : 0.5}}
          >
            Iniciar
          </button>
        </div>
      </div>
    </div>
  );
};

export const NewTaskDialog = ({open, ...props}: Props) =>
  open ? <DialogBody {...props} /> : null;
