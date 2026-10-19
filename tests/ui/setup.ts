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
  shell: {openInEditor: vi.fn()},
};

Object.defineProperty(window, 'fly', {value: fly, configurable: true});
