import type {UpdateNotice} from '../../../core/domain/setup';

type Props = {
  counts: {ready: number; working: number; ci: number; failed: number};
  message: string | null;
  update: UpdateNotice | null;
  onDownload(url: string): void;
};

export const FooterBar = ({counts, message, update, onDownload}: Props) => {
  const items: [string, number, string][] = [
    ['Esperando você', counts.ready, 'var(--warn)'],
    ['Agente rodando', counts.working, 'var(--info)'],
    ['CI', counts.ci, 'var(--muted)'],
    ['Falhou', counts.failed, 'var(--err)'],
  ];
  return (
    <footer
      style={{
        display: 'flex',
        gap: 18,
        alignItems: 'center',
        padding: '0 14px',
        height: 26,
        borderTop: '1px solid var(--border)',
        background: 'var(--drawer)',
        color: 'var(--muted)',
        fontSize: 11,
      }}
    >
      {items.map(([label, count, color]) => (
        <span key={label} style={{display: 'flex', gap: 6}}>
          <span style={{color}}>{count}</span>
          <span>{label}</span>
        </span>
      ))}
      {message && (
        <span role="status" style={{marginLeft: 'auto', color: 'var(--warn)'}}>
          {message}
        </span>
      )}
      {update && (
        <span
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginLeft: message ? 0 : 'auto',
          }}
        >
          <span style={{color: 'var(--accent)'}}>
            {`fly v${update.version} disponível`}
          </span>
          <button
            type="button"
            onClick={() => onDownload(update.url)}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              color: 'var(--accent)',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Baixar
          </button>
        </span>
      )}
    </footer>
  );
};
