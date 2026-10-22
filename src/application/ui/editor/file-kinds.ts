export type FileLanguage =
  | 'typescript'
  | 'javascript'
  | 'go'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'shell'
  | 'dockerfile'
  | 'makefile'
  | 'plain';

export type FileKind = {
  language: FileLanguage;
  jsx: boolean;
  name: string;
  label: string;
  color: string;
};

type Look = Omit<FileKind, 'language' | 'jsx'>;

const looks: Record<Exclude<FileLanguage, 'plain'>, Look> = {
  typescript: {name: 'TypeScript', label: 'ts', color: '#2396ed'},
  javascript: {name: 'JavaScript', label: 'js', color: 'var(--warn)'},
  go: {name: 'Go', label: 'go', color: 'var(--info)'},
  json: {name: 'JSON', label: '{}', color: '#CCDA3D'},
  yaml: {name: 'YAML', label: 'yml', color: 'var(--warn)'},
  markdown: {name: 'Markdown', label: 'md', color: 'var(--muted)'},
  shell: {name: 'Shell', label: 'sh', color: 'var(--ok)'},
  dockerfile: {name: 'Dockerfile', label: 'dk', color: 'var(--info)'},
  makefile: {name: 'Makefile', label: 'mk', color: 'var(--syTitle)'},
};

const byExtension: Record<string, Exclude<FileLanguage, 'plain'>> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  go: 'go',
  json: 'json',
  jsonc: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  mdx: 'markdown',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  bats: 'shell',
  dockerfile: 'dockerfile',
  mk: 'makefile',
};

const shellDotfiles = ['.zshrc', '.zprofile', '.bashrc', '.bash_profile'];

const kindOf = (language: Exclude<FileLanguage, 'plain'>, jsx = false) => ({
  language,
  jsx,
  ...looks[language],
});

// Case-insensitive; a leading dot (`.env`) does not start an extension.
export const fileKind = (basename: string): FileKind => {
  const lower = basename.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const extension = dot > 0 ? lower.slice(dot + 1) : '';
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) {
    return kindOf('dockerfile');
  }
  if (lower === 'makefile' || lower === 'gnumakefile') {
    return kindOf('makefile');
  }
  if (shellDotfiles.includes(lower)) {
    return kindOf('shell');
  }
  const language = byExtension[extension];
  if (language) {
    return kindOf(language, extension === 'tsx' || extension === 'jsx');
  }
  return {
    language: 'plain',
    jsx: false,
    name: 'Texto',
    label: extension.slice(0, 2) || 'tx',
    color: 'var(--faint)',
  };
};
