import {type CSSProperties, type ReactNode, useState} from 'react';

import type {SetupInfo} from '../../../core/domain/setup';
import {errorMessage} from '../state/fly-store';
import {
  CommandStep,
  DependenciesStep,
  DoneStep,
  type StepResult,
} from './setup-steps';

type Props = {
  info: SetupInfo;
  onDone(): void;
};

const Card = ({children}: {children: ReactNode}) => (
  <main
    style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--page)',
    }}
  >
    <div style={{height: 38, WebkitAppRegion: 'drag'} as CSSProperties} />
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <section
        style={{
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          padding: 20,
          fontSize: 13,
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}
      >
        {children}
      </section>
    </div>
  </main>
);

const StepLabel = ({step}: {step: number}) => (
  <div
    style={{
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--muted)',
    }}
  >
    Passo {step} de 3
  </div>
);

export const SetupWizard = ({info, onDone}: Props) => {
  const [step, setStep] = useState(1);
  const [commandResult, setCommandResult] = useState<StepResult>('done');
  const [completeError, setCompleteError] = useState<string | null>(null);

  if (!info.inApplications) {
    return (
      <Card>
        <h2 style={{margin: 0, fontSize: 15, color: 'var(--strong)'}}>
          Arraste o fly para Aplicativos e abra de lá.
        </h2>
        <p style={{margin: 0, color: 'var(--text2)'}}>
          O fly está rodando de {info.bundlePath}.
        </p>
      </Card>
    );
  }

  // Reaching step 3 counts as completion, even with steps skipped.
  const reachDone = (result: StepResult) => {
    setCommandResult(result);
    setStep(3);
    window.fly.setup.complete().catch((failure: unknown) => {
      setCompleteError(errorMessage(failure));
    });
  };

  return (
    <Card>
      <StepLabel step={step} />
      {step === 1 && <DependenciesStep onNext={() => setStep(2)} />}
      {step === 2 && <CommandStep onNext={reachDone} />}
      {step === 3 && (
        <>
          <DoneStep
            results={{tools: 'done', command: commandResult}}
            onFinish={onDone}
          />
          {completeError && (
            <p role="alert" style={{margin: 0, color: 'var(--err)'}}>
              {completeError}
            </p>
          )}
        </>
      )}
    </Card>
  );
};
