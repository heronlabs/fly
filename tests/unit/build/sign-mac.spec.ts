import {execFileSync} from 'node:child_process';

import {signAsync} from '@electron/osx-sign';

import {sign, signingIdentity} from '../../../scripts/sign-mac';

vi.mock('node:child_process', () => ({execFileSync: vi.fn()}));
vi.mock('@electron/osx-sign', () => ({signAsync: vi.fn()}));

const HASH = '91B74495654C290978CEE9770063E2A84A5C3B69';

const FOUND = `
Policy: Code Signing
  Matching identities
  1) ${HASH} "heronlabs fly" (CSSMERR_TP_NOT_TRUSTED)
     1 identities found

  Valid identities only
     0 valid identities found
`;

const NONE = `
Policy: Code Signing
  Matching identities
     0 identities found

  Valid identities only
     0 valid identities found
`;

describe('scripts/sign-mac', () => {
  describe('signingIdentity', () => {
    it('Should take the hash of the first identity, trusted or not', () => {
      expect(signingIdentity(FOUND)).toBe(HASH);
    });

    it('Should be null when the keychain has no identity', () => {
      expect(signingIdentity(NONE)).toBeNull();
    });
  });

  describe('sign', () => {
    const app = '/tmp/dist/mac-arm64/fly.app';

    it('Should sign ad-hoc as given when there is no keychain', async () => {
      await sign({app, identity: '-'});

      expect(execFileSync).not.toHaveBeenCalled();
      expect(signAsync).toHaveBeenCalledWith({app, identity: '-'});
    });

    it("Should sign with the keychain's identity, skipping the trust check", async () => {
      vi.mocked(execFileSync).mockReturnValue(FOUND);

      await sign({app, identity: '-', keychain: '/tmp/build.keychain'});

      expect(execFileSync).toHaveBeenCalledWith(
        '/usr/bin/security',
        ['find-identity', '-p', 'codesigning', '/tmp/build.keychain'],
        {encoding: 'utf8'},
      );
      expect(signAsync).toHaveBeenCalledWith({
        app,
        identity: HASH,
        keychain: '/tmp/build.keychain',
        identityValidation: false,
      });
    });

    it('Should fail, never fall back to ad-hoc, when the keychain has no identity', async () => {
      vi.mocked(execFileSync).mockReturnValue(NONE);

      await expect(
        sign({app, identity: '-', keychain: '/tmp/build.keychain'}),
      ).rejects.toThrow('No code-signing identity in /tmp/build.keychain');
      expect(signAsync).not.toHaveBeenCalled();
    });
  });
});
