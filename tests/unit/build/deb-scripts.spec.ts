import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const ELECTRON_TARGET = "'/opt/${sanitizedProductName}/${executable}'";
const CLI_TARGET = "'/opt/${sanitizedProductName}/resources/bin/fly'";

// Drops the comment block right after the shebang, where ours explains itself.
const withoutHeader = (script: string): {header: string[]; body: string} => {
  const [shebang, ...rest] = script.split('\n');
  const end = rest.findIndex(line => !line.startsWith('#'));
  return {
    header: rest.slice(0, end),
    body: [shebang, ...rest.slice(end)].join('\n'),
  };
};

describe('deb maintainer scripts', () => {
  it.each(['after-install.tpl', 'after-remove.tpl'])(
    "Should differ from electron-builder's %s only in the link target",
    name => {
      const ours = readFileSync(resolve('build/linux', name), 'utf8');
      const theirs = readFileSync(
        resolve('node_modules/app-builder-lib/templates/linux', name),
        'utf8',
      );

      const {header, body} = withoutHeader(ours);

      expect(header.length).toBeGreaterThan(0);
      expect(theirs).toContain(ELECTRON_TARGET);
      expect(body).toBe(theirs.split(ELECTRON_TARGET).join(CLI_TARGET));
    },
  );

  it('Should keep the shebang on the first line', () => {
    for (const name of ['after-install.tpl', 'after-remove.tpl']) {
      expect(
        readFileSync(resolve('build/linux', name), 'utf8').split('\n')[0],
      ).toBe('#!/bin/bash');
    }
  });
});

// Replacing electron-builder's depends drops its defaults, so they are listed
// again; Electron 44 also loads libgbm and libasound at start, even to run the
// CLI, and electron-builder no longer lists them (libasound2 became
// libasound2t64 on Ubuntu 24.04).
describe('deb depends', () => {
  const debDepends = (): string[] => {
    const lines = readFileSync(resolve('electron-builder.yml'), 'utf8').split(
      '\n',
    );
    const deb = lines.indexOf('deb:');
    const start = lines.indexOf('  depends:', deb);
    const items: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (!line.startsWith('    - ')) break;
      items.push(line.slice('    - '.length).replace(/^'(.*)'$/, '$1'));
    }
    return deb === -1 || start === -1 ? [] : items;
  };

  const builderDefaults = (): string[] => {
    const source = readFileSync(
      resolve('node_modules/app-builder-lib/out/targets/FpmTarget.js'),
      'utf8',
    );
    const match = /return (\["libgtk-3-0"[^\]]*\]);/.exec(source);
    return match ? (JSON.parse(match[1]!) as string[]) : [];
  };

  it("Should keep every one of electron-builder's default depends", () => {
    const defaults = builderDefaults();

    expect(defaults.length).toBeGreaterThan(0);
    expect(debDepends()).toEqual(expect.arrayContaining(defaults));
  });

  it('Should depend on the libraries Electron loads that the defaults miss', () => {
    expect(debDepends()).toEqual(
      expect.arrayContaining(['libgbm1', 'libasound2t64 | libasound2']),
    );
  });
});

describe('package metadata', () => {
  // The deb's Homepage field is required; without it electron-builder reads
  // .git/config, which a worktree does not have (.git is a file there).
  it('Should name the project homepage', () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      homepage?: string;
    };

    expect(pkg.homepage).toBe('https://github.com/heronlabs/fly');
  });
});
