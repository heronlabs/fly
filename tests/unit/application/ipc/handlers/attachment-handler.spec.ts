import {AttachmentHandler} from '../../../../../src/application/ipc/handlers/attachment-handler';
import type {IpcHost} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import {ImageStore} from '../../../../../src/core/interfaces/image-store';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const savePng = vi.fn();

beforeEach(() => {
  listeners.clear();
  savePng.mockReset();
  new AttachmentHandler(host, {savePng} as ImageStore).register();
});

describe('AttachmentHandler', () => {
  it('Should register only the save-image channel', () => {
    expect([...listeners.keys()]).toEqual([channels.attachmentSaveImage]);
  });

  it('Should save the PNG bytes and return the file path', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    savePng.mockResolvedValue('/tmp/fly-image-a/image.png');

    const result = await listeners.get(channels.attachmentSaveImage)!({}, png);

    expect(savePng).toHaveBeenCalledWith(png);
    expect(result).toBe('/tmp/fly-image-a/image.png');
  });

  it('Should propagate the store error message', async () => {
    savePng.mockRejectedValue(new Error('ENOSPC'));
    await expect(
      listeners.get(channels.attachmentSaveImage)!({}, new Uint8Array()),
    ).rejects.toThrow('ENOSPC');
  });
});
