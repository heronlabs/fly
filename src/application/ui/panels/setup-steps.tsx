import {type CSSProperties, type ReactNode, useEffect, useState} from 'react';

import type {
  DoctorReport,
  InstallerImage,
  ToolCheck,
  ToolId,
} from '../../../core/domain/setup';
import {errorMessage} from '../state/fly-store';

export type StepResult = 'done' | 'skipped';

const BREW_SITE = 'https://brew.sh';

const buttonStyle: CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '5px 12px',
  cursor: 'pointer',
};

const primaryStyle: CSSProperties = {
  ...buttonStyle,
  background: 'var(--accent)',
  color: 'var(--onAccent)',
  borderColor: 'var(--accent)',
  fontWeight: 600,
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  padding: '5px 0',
  borderBottom: '1px dashed var(--border)',
};

const noteStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.4,
  color: 'var(--text2)',
};

const codeStyle: CSSProperties = {
  fontFamily: 'var(--fontMono)',
  fontSize: 11,
  background: 'var(--surface)',
  padding: '1px 4px',
  borderRadius: 4,
};

const Title = ({children}: {children: ReactNode}) => (
  <h2 style={{margin: 0, fontSize: 15, color: 'var(--strong)'}}>{children}</h2>
);

const Buttons = ({children}: {children: ReactNode}) => (
  <div
    style={{
      marginTop: 8,
      display: 'flex',
      gap: 6,
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
    }}
  >
    {children}
  </div>
);

const Failure = ({message}: {message: string | null}) =>
  message && (
    <p role="alert" style={{...noteStyle, color: 'var(--err)'}}>
      {message}
    </p>
  );

const brewCommand = (formula: string) => `brew install ${formula}`;

const ToolRow = ({
  tool,
  brew,
  installing,
  onInstall,
  onCopy,
  onOpenBrew,
}: {
  tool: ToolCheck;
  brew: boolean;
  installing: ToolId | null;
  onInstall(id: ToolId): void;
  onCopy(command: string): void;
  onOpenBrew(): void;
}) => {
  const fix = tool.fix;
  const command =
    fix?.kind === 'brew' ? brewCommand(fix.formula) : (fix?.command ?? '');
  return (
    <div>
      <div style={rowStyle}>
        <span>{tool.id}</span>
        <span style={{color: tool.ok ? 'var(--ok)' : 'var(--err)'}}>
          {tool.ok ? `✓ ${tool.version}` : `✗ ${tool.problem}`}
        </span>
      </div>
      {!tool.ok && fix && (
        <div style={{...noteStyle, padding: '6px 0'}}>
          {fix.kind === 'brew' && !brew && (
            <p style={noteStyle}>
              Homebrew não encontrado{' '}
              <button
                type="button"
                onClick={onOpenBrew}
                style={{...buttonStyle, padding: '0 6px'}}
              >
                brew.sh
              </button>
            </p>
          )}
          <code style={codeStyle}>{command}</code>{' '}
          {fix.kind === 'brew' && brew ? (
            <button
              type="button"
              disabled={installing !== null}
              onClick={() => onInstall(tool.id)}
              style={buttonStyle}
            >
              {installing === tool.id
                ? `Instalando ${tool.id}…`
                : 'Instalar com brew'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onCopy(command)}
              style={buttonStyle}
            >
              Copiar
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const DependenciesStep = ({onNext}: {onNext(): void}) => {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [installing, setInstalling] = useState<ToolId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setError(null);
    try {
      setReport(await window.fly.setup.doctor());
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  useEffect(() => {
    void check();
  }, []);

  const install = async (id: ToolId) => {
    setError(null);
    setInstalling(id);
    try {
      setReport(await window.fly.setup.installTool(id));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setInstalling(null);
    }
  };

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const openBrew = async () => {
    try {
      await window.fly.shell.openExternal(BREW_SITE);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const ready = report?.tools.every(tool => tool.ok) ?? false;
  return (
    <>
      <Title>Verificando o que o fly precisa</Title>
      {report?.tools.map(tool => (
        <ToolRow
          key={tool.id}
          tool={tool}
          brew={report.brew}
          installing={installing}
          onInstall={id => void install(id)}
          onCopy={command => void copy(command)}
          onOpenBrew={() => void openBrew()}
        />
      ))}
      <Failure message={error} />
      <Buttons>
        <button
          type="button"
          disabled={installing !== null}
          onClick={() => void check()}
          style={buttonStyle}
        >
          Verificar de novo
        </button>
        <button
          type="button"
          disabled={!ready || installing !== null}
          onClick={onNext}
          style={{...primaryStyle, opacity: ready ? 1 : 0.4}}
        >
          Continuar
        </button>
      </Buttons>
    </>
  );
};

export const CommandStep = ({onNext}: {onNext(result: StepResult): void}) => {
  const [state, setState] = useState<'missing' | 'installed' | 'other' | null>(
    null,
  );
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.fly.setup
      .commandState()
      .then(setState)
      .catch((failure: unknown) => setError(errorMessage(failure)));
  }, []);

  const install = async () => {
    setError(null);
    setInstalling(true);
    try {
      await window.fly.setup.installCommand();
      onNext('done');
    } catch (failure) {
      setError(errorMessage(failure));
      setInstalling(false);
    }
  };

  return (
    <>
      <Title>Comando fly no terminal</Title>
      <p style={noteStyle}>
        O fly também vai para a linha de comando, como o code do VSCode:
      </p>
      <p style={noteStyle}>
        <code style={codeStyle}>
          /usr/local/bin/fly → /Applications/fly.app
        </code>
      </p>
      <p style={noteStyle}>
        Sem mexer no .zshrc: /usr/local/bin já está no PATH padrão do macOS. O
        macOS vai pedir sua senha de administrador.
      </p>
      {state === 'other' && (
        <p style={{...noteStyle, color: 'var(--warn, var(--text2))'}}>
          /usr/local/bin/fly aponta para outro lugar; será substituído.
        </p>
      )}
      {state === 'installed' && (
        <p style={{...noteStyle, color: 'var(--ok)'}}>✓ já instalado</p>
      )}
      <Failure message={error} />
      <Buttons>
        {error !== null && (
          <button
            type="button"
            onClick={() => onNext('skipped')}
            style={buttonStyle}
          >
            Pular
          </button>
        )}
        {state === 'installed' ? (
          <button
            type="button"
            onClick={() => onNext('done')}
            style={primaryStyle}
          >
            Continuar
          </button>
        ) : (
          state !== null && (
            <button
              type="button"
              disabled={installing}
              onClick={() => void install()}
              style={primaryStyle}
            >
              {error === null ? 'Instalar e continuar' : 'Tentar de novo'}
            </button>
          )
        )}
      </Buttons>
    </>
  );
};

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const dirname = (path: string) => path.slice(0, path.lastIndexOf('/'));

export const DoneStep = ({
  results,
  onFinish,
}: {
  results: Record<'tools' | 'command', StepResult>;
  onFinish(): void;
}) => {
  const [image, setImage] = useState<InstallerImage | null>(null);
  const [trashing, setTrashing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.fly.setup
      .installer()
      .then(setImage)
      .catch(() => setImage(null));
  }, []);

  const trash = async () => {
    setError(null);
    setTrashing(true);
    try {
      await window.fly.setup.trashInstaller();
      onFinish();
    } catch (failure) {
      setError(errorMessage(failure));
      setTrashing(false);
    }
  };

  const mark = (result: StepResult) => (
    <span style={{color: result === 'done' ? 'var(--ok)' : 'var(--muted)'}}>
      {result === 'done' ? '✓' : 'pulado'}
    </span>
  );

  return (
    <>
      <Title>Tudo pronto</Title>
      <div style={rowStyle}>
        <span>Dependências</span>
        {mark(results.tools)}
      </div>
      <div style={rowStyle}>
        <span>Comando fly</span>
        {mark(results.command)}
      </div>
      {image && (
        <div style={{marginTop: 8}}>
          <p style={{...noteStyle, color: 'var(--strong)', fontWeight: 600}}>
            Apagar o instalador?
          </p>
          <p style={noteStyle}>
            {`${basename(image.imagePath)} em ${dirname(image.imagePath)}. O disco é ejetado e o arquivo vai para a Lixeira.`}
          </p>
        </div>
      )}
      <Failure message={error} />
      <Buttons>
        {image ? (
          <>
            <button
              type="button"
              disabled={trashing}
              onClick={onFinish}
              style={buttonStyle}
            >
              Manter
            </button>
            <button
              type="button"
              disabled={trashing}
              onClick={() => void trash()}
              style={primaryStyle}
            >
              Mover para Lixeira
            </button>
          </>
        ) : (
          <button type="button" onClick={onFinish} style={primaryStyle}>
            Começar
          </button>
        )}
      </Buttons>
    </>
  );
};
