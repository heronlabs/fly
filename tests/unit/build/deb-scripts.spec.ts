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
