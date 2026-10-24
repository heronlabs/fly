import type {WorktreeInfo} from '../../../../src/core/interfaces/vcs-gateway';
import {planLaunch} from '../../../../src/core/services/launch-rules';

const info = (path: string, isMain = false): WorktreeInfo => ({
  path,
  head: 'h',
  branch: null,
  isMain,
  locked: false,
});
const main = info('/w/fly', true);
const feat = info('/w/fly/.worktrees/feat');

describe('planLaunch', () => {
  it('Should open the deepest recent root holding the folder and select its worktree', () => {
    expect(
      planLaunch({
        folder: '/w/fly/.worktrees/feat/src',
        recentRoots: [
          {root: '/w', realPath: '/w'},
          {root: '/link/fly', realPath: '/w/fly'},
          {root: '/x', realPath: '/x'},
        ],
        worktrees: [main, feat],
      }),
    ).toEqual({
      root: '/link/fly',
      base: '/w/fly',
      folder: '/w/fly/.worktrees/feat/src',
      worktree: '/w/fly/.worktrees/feat',
      worktreeId: '.worktrees/feat',
    });
  });

  it('Should prefer the deepest recent root whatever the order', () => {
    expect(
      planLaunch({
        folder: '/w/fly',
        recentRoots: [
          {root: '/w/fly', realPath: '/w/fly'},
          {root: '/w', realPath: '/w'},
        ],
        worktrees: [],
      }).root,
    ).toBe('/w/fly');
  });

  it('Should select the deepest worktree whatever the order', () => {
    expect(
      planLaunch({
        folder: '/w/fly/.worktrees/feat',
        recentRoots: [{root: '/w', realPath: '/w'}],
        worktrees: [feat, main],
      }).worktreeId,
    ).toBe('fly/.worktrees/feat');
  });

  it('Should open a recent root equal to the folder', () => {
    expect(
      planLaunch({
        folder: '/w',
        recentRoots: [{root: '/w', realPath: '/w'}],
        worktrees: [],
      }),
    ).toEqual({
      root: '/w',
      base: '/w',
      folder: '/w',
      worktree: null,
      worktreeId: null,
    });
  });

  it('Should not climb to a recent root that only shares a name prefix', () => {
    expect(
      planLaunch({
        folder: '/w/fly-2',
        recentRoots: [{root: '/w/fly', realPath: '/w/fly'}],
        worktrees: [],
      }).root,
    ).toBe('/w/fly-2');
  });

  it('Should open the parent of the main worktree outside every recent root', () => {
    expect(
      planLaunch({
        folder: '/w/fly/.worktrees/feat',
        recentRoots: [{root: '/x', realPath: '/x'}],
        worktrees: [main, feat],
      }),
    ).toEqual({
      root: '/w',
      base: '/w',
      folder: '/w/fly/.worktrees/feat',
      worktree: '/w/fly/.worktrees/feat',
      worktreeId: 'fly/.worktrees/feat',
    });
  });

  it('Should fall back to the main worktree when no worktree holds the folder', () => {
    expect(
      planLaunch({
        folder: '/w/bare.git/hooks',
        recentRoots: [],
        worktrees: [info('/w/bare.git/x', true), info('/w/feat-2')],
      }),
    ).toMatchObject({
      root: '/w/bare.git',
      worktree: '/w/bare.git/x',
      worktreeId: 'x',
    });
  });

  it('Should not hold a folder in a worktree that only shares a name prefix', () => {
    expect(
      planLaunch({
        folder: '/w/fly/.worktrees/feat-2',
        recentRoots: [],
        worktrees: [main, feat],
      }).worktree,
    ).toBe('/w/fly');
  });

  it('Should make a folder outside git and recent roots its own root', () => {
    expect(
      planLaunch({folder: '/notes', recentRoots: [], worktrees: []}),
    ).toEqual({
      root: '/notes',
      base: '/notes',
      folder: '/notes',
      worktree: null,
      worktreeId: null,
    });
  });
});
