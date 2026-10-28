import {
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useState,
} from 'react';

import type {NewTaskInput} from '../../../core/domain/task';
import type {Repo} from '../../../core/domain/workspace';
import {MODEL_OPTIONS, suggestBranch} from './branch-name';

type Props = {
  open: boolean;
  repos: Repo[];
  defaultRepoId: string | null;
  error?: string | null;
  submitting?: boolean;
  onCancel(): void;
  onSubmit(input: NewTaskInput): void;
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
  submitting = false,
  onCancel,
  onSubmit,
}: Omit<Props, 'open'>) => {
  const [repoId, setRepoId] = useState(defaultRepoId ?? repos[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [branch, setBranch] = useState('');
  const [branchEdited, setBranchEdited] = useState(false);
  const [model, setModel] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const trimmed = description.trim();
  const ready = trimmed !== '' && branch.trim() !== '' && !submitting;

  const changeDescription = (value: string) => {
    setDescription(value);
    if (!branchEdited) {
      setBranch(suggestBranch(value));
    }
  };

  const addAttachments = (paths: string[]) =>
    setAttachments(current => [
      ...current,
      ...paths.filter(path => !current.includes(path)),
    ]);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    addAttachments(
      Array.from(event.dataTransfer?.files ?? [], file =>
        window.fly.attachments.pathForFile(file),
      ).filter(path => path !== ''),
    );
  };

  const onPaste = (event: ClipboardEvent) => {
    const image = Array.from(event.clipboardData?.files ?? []).find(
      file => file.type === 'image/png',
    );
    if (!image) {
      return;
    }
    event.preventDefault();
    image
      .arrayBuffer()
      .then(bytes => window.fly.attachments.saveImage(new Uint8Array(bytes)))
      .then(
        path => addAttachments([path]),
        () => undefined,
      );
  };

  const pick = () =>
    void window.fly.tasks
      .pickAttachments()
      .then(addAttachments, () => undefined);

  const submit = () => {
    if (ready) {
      onSubmit({
        repoId,
        description: trimmed,
        branch: branch.trim(),
        model: model || null,
        attachments,
      });
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
        onPaste={onPaste}
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
            onChange={event => changeDescription(event.target.value)}
            style={{...fieldStyle, resize: 'vertical'}}
          />
        </label>
        <label style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          Branch
          <input
            value={branch}
            onChange={event => {
              setBranchEdited(true);
              setBranch(event.target.value);
            }}
            style={fieldStyle}
          />
        </label>
        <label style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          Modelo
          <select
            value={model}
            onChange={event => setModel(event.target.value)}
            style={fieldStyle}
          >
            <option value="">Padrão do Claude Code</option>
            {MODEL_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div
          onDragOver={event => event.preventDefault()}
          onDrop={onDrop}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 8,
            border: '1px dashed var(--border)',
            borderRadius: 6,
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
            <button type="button" onClick={pick} style={buttonStyle}>
              Anexar arquivos
            </button>
            <span style={{color: 'var(--text2)'}}>
              Arraste arquivos aqui ou cole uma imagem
            </span>
          </div>
          {attachments.map(path => (
            <div
              key={path}
              style={{display: 'flex', alignItems: 'center', gap: 8}}
            >
              <span style={{flex: 1, wordBreak: 'break-all'}}>{path}</span>
              <button
                type="button"
                onClick={() =>
                  setAttachments(current => current.filter(p => p !== path))
                }
                style={buttonStyle}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
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
            disabled={!ready}
            onClick={submit}
            style={{...buttonStyle, opacity: ready ? 1 : 0.5}}
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
