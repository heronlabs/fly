import {readFileSync} from 'node:fs';

const chunkTypes = (icns: Buffer): string[] => {
  const types: string[] = [];
  for (let at = 8; at < icns.length; at += icns.readUInt32BE(at + 4)) {
    types.push(icns.toString('latin1', at, at + 4));
  }
  return types;
};

describe('build/icon.icns', () => {
  const icns = readFileSync('build/icon.icns');

  it('Should be an icns file', () => {
    expect(icns.toString('latin1', 0, 4)).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
  });

  // electron-builder's own conversion writes these, and macOS draws them as noise.
  it('Should hold the small sizes as ic04/ic05, never icp4/icp5', () => {
    const types = chunkTypes(icns);
    expect(types).toEqual(expect.arrayContaining(['ic04', 'ic05']));
    expect(types).not.toContain('icp4');
    expect(types).not.toContain('icp5');
  });
});
