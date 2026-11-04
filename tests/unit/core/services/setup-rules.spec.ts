import {
  BREW_TOOLS,
  bundleRoot,
  checkTool,
  compareVersions,
  isNewer,
} from '../../../../src/core/services/setup-rules';

describe('compareVersions', () => {
  it('Should order versions numerically per dot part', () => {
    expect(compareVersions('2.1.310', '2.1.309')).toBeGreaterThan(0);
    expect(compareVersions('2.1.309', '2.1.309')).toBe(0);
    expect(compareVersions('2.10', '2.9')).toBeGreaterThan(0);
    expect(compareVersions('2.9', '2.10')).toBeLessThan(0);
    expect(compareVersions('1', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('1.0.1', '1')).toBeGreaterThan(0);
  });

  it('Should read the leading digits of each part', () => {
    expect(compareVersions('3.5a', '3.5')).toBe(0);
    expect(compareVersions('3.6a', '3.5')).toBeGreaterThan(0);
  });
});

describe('isNewer', () => {
  it('Should be true only for a strictly newer candidate', () => {
    expect(isNewer('0.4.0', '0.3.0')).toBe(true);
    expect(isNewer('0.3.0', '0.3.0')).toBe(false);
    expect(isNewer('0.2.9', '0.3.0')).toBe(false);
  });
});

describe('BREW_TOOLS', () => {
  it('Should list the tools brew can install', () => {
    expect(BREW_TOOLS).toEqual(['git', 'gh', 'tmux']);
  });
});

describe('bundleRoot', () => {
  it('Should find the bundle three levels above the mac executable', () => {
    expect(bundleRoot('/Applications/fly.app/Contents/MacOS/fly', 'mac')).toBe(
      '/Applications/fly.app',
    );
  });

  it('Should find the install dir above the Linux executable', () => {
    expect(bundleRoot('/opt/fly/fly', 'linux')).toBe('/opt/fly');
  });
});

describe('checkTool', () => {
  it.each(['git', 'gh', 'tmux'] as const)(
    'Should offer a brew install when %s is missing',
    id => {
      expect(checkTool(id, {version: null}, 'mac')).toEqual({
        id,
        ok: false,
        version: null,
        problem: 'não encontrado',
        fix: {kind: 'brew', formula: id},
      });
    },
  );

  it('Should tell how to install a missing claude', () => {
    expect(checkTool('claude', {version: null}, 'mac')).toEqual({
      id: 'claude',
      ok: false,
      version: null,
      problem: 'não encontrado',
      fix: {kind: 'copy', command: 'npm install -g @anthropic-ai/claude-code'},
    });
  });

  it('Should ask for gh auth login when gh is logged out', () => {
    expect(
      checkTool('gh', {version: '2.92.0', loggedIn: false}, 'mac'),
    ).toEqual({
      id: 'gh',
      ok: false,
      version: '2.92.0',
      problem: 'não logado',
      fix: {kind: 'copy', command: 'gh auth login'},
    });
  });

  it('Should accept gh logged in', () => {
    expect(checkTool('gh', {version: '2.92.0', loggedIn: true}, 'mac')).toEqual(
      {
        id: 'gh',
        ok: true,
        version: '2.92.0',
        problem: null,
        fix: null,
      },
    );
  });

  it('Should not require a login probe for tools other than gh', () => {
    expect(
      checkTool('git', {version: '2.54.0', loggedIn: false}, 'mac'),
    ).toEqual({
      id: 'git',
      ok: true,
      version: '2.54.0',
      problem: null,
      fix: null,
    });
    expect(checkTool('git', {version: '2.54.0'}, 'mac').ok).toBe(true);
  });

  it('Should treat an unprobed gh login as logged in', () => {
    expect(checkTool('gh', {version: '2.92.0'}, 'mac').ok).toBe(true);
  });

  it('Should ask for claude update below the minimum version', () => {
    expect(checkTool('claude', {version: '2.1.300'}, 'mac')).toEqual({
      id: 'claude',
      ok: false,
      version: '2.1.300',
      problem: 'versão 2.1.300; precisa 2.1.309 ou mais',
      fix: {kind: 'copy', command: 'claude update'},
    });
  });

  it('Should accept claude at the minimum version', () => {
    expect(checkTool('claude', {version: '2.1.309'}, 'mac')).toEqual({
      id: 'claude',
      ok: true,
      version: '2.1.309',
      problem: null,
      fix: null,
    });
  });

  it('Should not hold other tools to the claude minimum', () => {
    expect(checkTool('tmux', {version: '1.0'}, 'mac').ok).toBe(true);
  });

  it.each(['git', 'gh', 'tmux'] as const)(
    'Should hint apt for a missing %s on Linux',
    id => {
      expect(checkTool(id, {version: null}, 'linux')).toEqual({
        id,
        ok: false,
        version: null,
        problem: 'não encontrado',
        fix: {kind: 'copy', command: `sudo apt install ${id}`},
      });
    },
  );

  it('Should keep the npm command for claude on Linux', () => {
    expect(checkTool('claude', {version: null}, 'linux').fix).toEqual({
      kind: 'copy',
      command: 'npm install -g @anthropic-ai/claude-code',
    });
  });

  it('Should keep the login and update fixes on Linux', () => {
    expect(
      checkTool('gh', {version: '2.92.0', loggedIn: false}, 'linux').fix,
    ).toEqual({kind: 'copy', command: 'gh auth login'});
    expect(checkTool('claude', {version: '2.1.300'}, 'linux').fix).toEqual({
      kind: 'copy',
      command: 'claude update',
    });
  });

  // Ubuntu 22.04's apt gh (2.4.0) has no `run rerun --failed` and no
  // headRefOid in `pr list --json`; Debian 12's 2.23.0 has both.
  it.each([
    ['mac', 'brew upgrade gh'],
    ['linux', 'https://github.com/cli/cli/blob/trunk/docs/install_linux.md'],
  ] as const)(
    'Should ask for a newer gh below the minimum on %s',
    (platform, command) => {
      expect(
        checkTool('gh', {version: '2.4.0', loggedIn: true}, platform),
      ).toEqual({
        id: 'gh',
        ok: false,
        version: '2.4.0',
        problem: 'versão 2.4.0; precisa 2.23.0 ou mais',
        fix: {kind: 'copy', command},
      });
    },
  );

  it('Should report an old gh before its login', () => {
    expect(
      checkTool('gh', {version: '2.22.9', loggedIn: false}, 'mac').problem,
    ).toBe('versão 2.22.9; precisa 2.23.0 ou mais');
  });

  it('Should accept gh at the minimum version', () => {
    expect(
      checkTool('gh', {version: '2.23.0', loggedIn: true}, 'linux').ok,
    ).toBe(true);
  });
});
