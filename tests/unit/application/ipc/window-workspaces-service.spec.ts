import {WindowWorkspacesService} from '../../../../src/application/ipc/window-workspaces-service';
import type {Workspace} from '../../../../src/core/domain/workspace';

const at = (root: string): Workspace => ({root, repos: [], worktrees: []});

describe('WindowWorkspacesService', () => {
  let windows: WindowWorkspacesService;

  beforeEach(() => {
    windows = new WindowWorkspacesService();
  });

  it('Should show nothing for a window that opened no folder', () => {
    expect(windows.of(1)).toBeNull();
    expect(windows.entries()).toEqual([]);
    expect(windows.all()).toEqual([]);
    expect(windows.windowOf('/r')).toBeNull();
  });

  it("Should keep each window's workspace apart, replacing on a new one", () => {
    const first = at('/r');
    const second = at('/s');
    windows.set(1, first);
    windows.set(2, second);
    windows.set(1, at('/t'));
    expect(windows.of(1)).toEqual(at('/t'));
    expect(windows.of(2)).toBe(second);
    expect(windows.entries()).toEqual([
      [1, at('/t')],
      [2, second],
    ]);
    expect(windows.all()).toEqual([at('/t'), second]);
  });

  it('Should forget a closed window', () => {
    windows.set(1, at('/r'));
    windows.set(2, at('/s'));
    windows.forget(1);
    expect(windows.of(1)).toBeNull();
    expect(windows.all()).toEqual([at('/s')]);
  });

  it('Should find the oldest window that shows a root', () => {
    windows.set(3, at('/s'));
    windows.set(1, at('/r'));
    windows.set(2, at('/r'));
    expect(windows.windowOf('/r')).toBe(1);
    expect(windows.windowOf('/s')).toBe(3);
    expect(windows.windowOf('/x')).toBeNull();
  });
});
