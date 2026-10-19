import type {WorktreeStatus} from '../state/fly-store';

const colors: Record<WorktreeStatus, string> = {
  idle: 'var(--faint)',
  engineer: 'var(--info)',
  ci: 'var(--warn)',
  failed: 'var(--err)',
  ready: 'var(--ok)',
  review: 'var(--accent)',
  merged: 'var(--strong)',
  unknown: 'var(--faint)',
};

export const StatusDot = ({status}: {status: WorktreeStatus}) => (
  <span
    aria-hidden="true"
    title={status}
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      flex: 'none',
      background: colors[status],
    }}
  />
);
