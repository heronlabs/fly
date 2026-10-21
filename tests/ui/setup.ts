import '@testing-library/jest-dom/vitest';

import type {FlyApi} from '../../src/core/domain/fly-api';

// mockReset runs before each test, so tests set their own implementations.
const fly: FlyApi = {
  workspace: {
    pickFolder: vi.fn(),
    open: vi.fn(),
    refresh: vi.fn(),
    onChanged: vi.fn(),
  },
  settings: {get: vi.fn(), set: vi.fn()},
  shell: {openInEditor: vi.fn(), openExternal: vi.fn()},
  diff: {get: vi.fn()},
  pullRequests: {merge: vi.fn()},
  sessions: {
    list: vi.fn(),
    start: vi.fn(),
    kill: vi.fn(),
    onChanged: vi.fn(),
  },
  queue: {list: vi.fn(), onChanged: vi.fn(() => () => {})},
  tasks: {create: vi.fn()},
  terminal: {
    attach: vi.fn(),
    detach: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  },
};

Object.defineProperty(window, 'fly', {value: fly, configurable: true});
