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
  shell: {openExternal: vi.fn()},
  diff: {get: vi.fn()},
  files: {
    list: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    poll: vi.fn(),
    search: vi.fn(),
  },
  pullRequests: {
    merge: vi.fn(),
    open: vi.fn(),
    rerun: vi.fn(),
    resume: vi.fn(),
    clean: vi.fn(),
  },
  sessions: {
    list: vi.fn(),
    start: vi.fn(),
    kill: vi.fn(),
    onChanged: vi.fn(),
  },
  queue: {list: vi.fn(), onChanged: vi.fn(() => () => {})},
  tasks: {create: vi.fn(), pickAttachments: vi.fn()},
  terminal: {
    attach: vi.fn(),
    detach: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  },
  attachments: {pathForFile: vi.fn(), saveImage: vi.fn()},
  launch: {take: vi.fn(async () => null), onRequested: vi.fn(() => () => {})},
  updates: {get: vi.fn(async () => null), onChanged: vi.fn(() => () => {})},
  setup: {
    info: vi.fn(async () => ({
      packaged: false,
      inApplications: false,
      bundlePath: null,
      open: false,
    })),
    doctor: vi.fn(),
    installTool: vi.fn(),
    commandState: vi.fn(),
    installCommand: vi.fn(),
    installer: vi.fn(async () => null),
    trashInstaller: vi.fn(),
    complete: vi.fn(),
    onRequested: vi.fn(() => () => {}),
  },
};

Object.defineProperty(window, 'fly', {value: fly, configurable: true});

// CodeMirror measures text through Range rects and scrolls the selection into
// view; jsdom implements neither, so it gets empty rects and a no-op scroll.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
Element.prototype.scrollIntoView = () => undefined;
