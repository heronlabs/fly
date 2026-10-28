import type {AppRuntime} from '../../../../src/core/interfaces/app-runtime';
import type {ReleaseSource} from '../../../../src/core/interfaces/release-source';
import {UpdateService} from '../../../../src/core/services/update-service';

describe('UpdateService', () => {
  const latest = vi.fn();
  const service = new UpdateService(
    {latest} as unknown as ReleaseSource,
    {version: '0.3.0', bundlePath: null} as AppRuntime,
  );
  const release = (version: string) => ({
    version,
    url: `https://github.com/heronlabs/fly/releases/tag/v${version}`,
  });

  it('Should start with no notice', () => {
    expect(service.current()).toBeNull();
  });

  it('Should store and return a newer release', async () => {
    latest.mockResolvedValue(release('0.4.0'));

    await expect(service.check()).resolves.toEqual(release('0.4.0'));
    expect(service.current()).toEqual(release('0.4.0'));
  });

  it('Should clear the notice when the latest is not newer', async () => {
    latest.mockResolvedValue(release('0.3.0'));

    await expect(service.check()).resolves.toBeNull();
    expect(service.current()).toBeNull();
  });

  it('Should keep the previous notice when the check fails', async () => {
    latest.mockResolvedValue(release('0.4.0'));
    await service.check();
    latest.mockRejectedValue(new Error('HTTP 404'));

    await expect(service.check()).resolves.toEqual(release('0.4.0'));
    expect(service.current()).toEqual(release('0.4.0'));
  });
});
