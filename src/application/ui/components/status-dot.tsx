import type {QueueStatus} from '../../../core/domain/queue';

const looks: Record<
  QueueStatus,
  {color: string; title: string; badge: string | null}
> = {
  idle: {color: 'var(--faint)', title: 'Parado', badge: null},
  engineer: {color: 'var(--info)', title: 'Agente rodando', badge: 'eng'},
  waiting: {color: 'var(--syTitle)', title: 'Esperando você', badge: 'você'},
  ci: {color: 'var(--warn)', title: 'CI rodando', badge: 'CI'},
  failed: {color: 'var(--err)', title: 'Falhou', badge: 'falhou'},
  ready: {color: 'var(--ok)', title: 'Pronto para merge', badge: 'merge'},
  merged: {color: 'var(--muted)', title: 'Merged', badge: 'merged'},
  unknown: {color: 'var(--faint)', title: 'Estado desconhecido', badge: '?'},
};

export const StatusDot = ({status}: {status: QueueStatus}) => (
  <span
    aria-hidden="true"
    title={looks[status].title}
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      flex: 'none',
      background: looks[status].color,
    }}
  />
);

export const StatusBadge = ({status}: {status: QueueStatus}) => {
  const {color, title, badge} = looks[status];
  if (badge === null) return null;
  return (
    <span
      aria-label={title}
      style={{
        flex: 'none',
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 999,
        color,
        background: 'var(--surface)',
      }}
    >
      {badge}
    </span>
  );
};
