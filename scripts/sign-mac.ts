// electron-builder's custom sign (`mac.sign` in electron-builder.yml).
//
// With CSC_LINK set, electron-builder imports that p12 into a temporary
// keychain and passes it here as `opts.keychain`. The app is then signed with
// that certificate, so its designated requirement (identifier + certificate)
// stays the same from one version to the next and macOS keeps the privacy
// permissions given to fly. An ad-hoc signature is pinned to the build's
// hash, so every update lost them. electron-builder only picks trusted
// identities and fly's self-signed one is not, hence this hook.
//
// Without a keychain (a local `pnpm dist`) it signs ad-hoc, as before.
import {execFileSync} from 'node:child_process';

import {signAsync, type SignOptions} from '@electron/osx-sign';

// The first code-signing identity `security find-identity` lists, trusted or
// not; null when there is none.
export const signingIdentity = (findIdentityOutput: string): string | null =>
  /^\s*\d+\) ([0-9A-F]{40}) /m.exec(findIdentityOutput)?.[1] ?? null;

export const sign = async (opts: SignOptions): Promise<void> => {
  if (!opts.keychain) return signAsync(opts);
  const identity = signingIdentity(
    execFileSync(
      '/usr/bin/security',
      ['find-identity', '-p', 'codesigning', opts.keychain],
      {encoding: 'utf8'},
    ),
  );
  if (!identity) {
    throw new Error(`No code-signing identity in ${opts.keychain}`);
  }
  return signAsync({...opts, identity, identityValidation: false});
};
