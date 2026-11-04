export type Platform = 'mac' | 'linux';

// fly runs on macOS and Linux only; anything else fails at start, before any
// seam picks a behaviour it does not have.
export const platformOf = (nodePlatform: string): Platform => {
  if (nodePlatform === 'darwin') return 'mac';
  if (nodePlatform === 'linux') return 'linux';
  throw new Error(`Plataforma não suportada: ${nodePlatform}`);
};
