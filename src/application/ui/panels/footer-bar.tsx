type Props = {
  counts: {ready: number; working: number; ci: number; failed: number};
};

export const FooterBar = ({counts}: Props) => {
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
    </footer>
  );
};
