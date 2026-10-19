type Props = {title: string; hint: string};

export const PlaceholderPanel = ({title, hint}: Props) => (
  <section
    style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      background: 'var(--surface)',
      color: 'var(--muted)',
    }}
  >
    <h2 style={{margin: 0, fontSize: 14, color: 'var(--text2)'}}>{title}</h2>
    <p style={{margin: 0}}>{hint}</p>
  </section>
);
