import {FileStore} from '../../../../src/core/interfaces/file-store';
import {linkState} from '../../../../src/infrastructure/environment/command-link';

describe('linkState', () => {
  const exists = vi.fn();
  const realPath = vi.fn();
  const files = {exists, realPath} as unknown as FileStore;

  beforeEach(() => {
    exists.mockReset();
    realPath.mockReset();
  });

  it('Should be missing when the link is absent', async () => {
    exists.mockResolvedValue(false);

    expect(await linkState(files, '/bin/fly', '/A/fly')).toBe('missing');
    expect(exists).toHaveBeenCalledWith('/bin/fly');
    expect(realPath).not.toHaveBeenCalled();
  });

  it('Should be installed when both resolve to the same file', async () => {
    exists.mockResolvedValue(true);
    realPath.mockResolvedValue('/A/fly');

    expect(await linkState(files, '/bin/fly', '/A/fly')).toBe('installed');
    expect(realPath).toHaveBeenCalledWith('/bin/fly');
    expect(realPath).toHaveBeenCalledWith('/A/fly');
  });

  it('Should be other when they resolve differently', async () => {
    exists.mockResolvedValue(true);
    realPath.mockImplementation(async (path: string) =>
      path === '/A/fly' ? '/A/fly' : '/B/fly',
    );

    expect(await linkState(files, '/bin/fly', '/A/fly')).toBe('other');
  });

  it('Should be other when a real path cannot be resolved', async () => {
    exists.mockResolvedValue(true);
    realPath.mockRejectedValue(new Error('ENOENT'));

    expect(await linkState(files, '/bin/fly', '/A/fly')).toBe('other');
  });
});
