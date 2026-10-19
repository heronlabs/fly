import {FolderOpenOutlined} from '@ant-design/icons';

import logo from '../assets/logo.png';

type Props = {
  recentRoots: string[];
  onPick(): void;
  onOpen(root: string): void;
  error: string | null;
};

export const WelcomePanel = ({recentRoots, onPick, onOpen, error}: Props) => (
  <main
    style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--page)',
    }}
  >
    <div style={{height: 38, WebkitAppRegion: 'drag'} as React.CSSProperties} />
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
        <img src={logo} alt="" width={24} height={24} />
        <span
          style={{
            fontFamily: 'var(--fontDisplay)',
            fontSize: 22,
            color: 'var(--strong)',
          }}
        >
          heronlabs
        </span>
      </div>
      <button
        type="button"
        onClick={onPick}
        style={{
          background: 'var(--accent)',
          color: 'var(--onAccent)',
          border: 0,
          borderRadius: 6,
          padding: '8px 16px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        <FolderOpenOutlined /> Abrir pasta
      </button>
      {error && (
        <p role="alert" style={{margin: 0, color: 'var(--err)'}}>
          {error}
        </p>
      )}
      {recentRoots.length > 0 && (
        <section style={{display: 'flex', flexDirection: 'column', gap: 4}}>
          <h2 style={{margin: 0, fontSize: 11, color: 'var(--muted)'}}>
            Recentes
          </h2>
          {recentRoots.map(root => (
            <button
              key={root}
              type="button"
              onClick={() => onOpen(root)}
              style={{
                background: 'none',
                border: 0,
                padding: '2px 0',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--accentText)',
                fontFamily: 'var(--fontMono)',
              }}
            >
              {root}
            </button>
          ))}
        </section>
      )}
    </div>
  </main>
);
