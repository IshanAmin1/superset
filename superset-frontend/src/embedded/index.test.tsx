/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
// Mark this file as a module so its top-level declarations stay file-scoped
// (the file has no imports; modules are loaded via require() inside tests).
import { TextEncoder } from 'util';
import { CHART_TYPE } from 'src/dashboard/util/componentTypes';

Object.assign(global, { TextEncoder });

const mockConfig = {
  GUEST_TOKEN_HEADER_NAME: 'X-Custom-Guest',
  GUEST_TOKEN_HEADER_MAX_BYTES: 100,
};

// Bootstrap `common.conf`; a test enables realtime by setting its keys.
const mockCommonConf: Record<string, unknown> = {};

// Stable mock references so they survive jest.resetModules() between tests
// (a factory-created jest.fn() would otherwise be replaced on each reset,
// leaving these imported handles pointing at a stale instance).
const mockSetupAGGridModules = jest.fn();
const mockLogging = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock('src/public-path', () => ({}));

jest.mock('query-string', () => ({}));

jest.mock('@superset-ui/core/components/ThemedAgGridReact', () => ({
  setupAGGridModules: mockSetupAGGridModules,
}));

jest.mock('@apache-superset/core/utils', () => ({
  logging: mockLogging,
}));

// setupPlugins is driven per-test so the retry path can force a rejection.
const mockSetupPlugins = jest.fn();
jest.mock('src/setup/setupPlugins', () => mockSetupPlugins, { virtual: true });

jest.mock('src/setup/setupCodeOverrides', () => jest.fn(), { virtual: true });

jest.mock('src/preamble', () => jest.fn().mockResolvedValue(true));

// makeApi returns a callable that resolves with the current user roles.
const mockGetMeWithRole = jest.fn();
jest.mock('@superset-ui/core', () => ({
  ...jest.requireActual('@superset-ui/core'),
  makeApi: () => mockGetMeWithRole,
}));

// Settings the embedded page reads from the SDK; a test turns features on here.
const mockUiConfig = { emitLoadEvents: false };
jest.mock('src/components/UiConfigContext', () => ({
  useUiConfig: () => mockUiConfig,
}));

// The dashboard page itself is not under test; render nothing in its place.
jest.mock('src/utils/lazyWithRetry', () => ({
  lazyWithRetry: () => () => null,
}));

// Capture the guestToken handler that start() is wired to, so tests can
// re-trigger the handshake and assert the retry behavior. `methods` keeps
// every method the handshake registers.
const mockSwitchboardInit = jest.fn();
const mockEmit = jest.fn();
const mockSwitchboard = {
  handler: undefined as ((arg: { guestToken: string }) => void) | undefined,
  methods: {} as Record<string, unknown>,
};
jest.mock('@superset-ui/switchboard', () => ({
  __esModule: true,
  default: {
    init: mockSwitchboardInit,
    start: jest.fn(),
    defineMethod: (name: string, fn: (arg: { guestToken: string }) => void) => {
      mockSwitchboard.methods[name] = fn;
      if (name === 'guestToken') {
        mockSwitchboard.handler = fn;
      }
    },
    emit: mockEmit,
  },
}));

const mockSetupClient = jest.fn();
jest.mock('src/setup/setupClient', () => mockSetupClient, { virtual: true });

// The store's state is swapped per test; `mockSubscribe` keeps the listeners
// so a test can play a store update.
const mockStoreState: { current: Record<string, unknown> } = {
  current: { dataMask: {} },
};
const mockUnsubscribe = jest.fn();
const mockSubscribe = jest.fn((_listener: () => void) => mockUnsubscribe);
jest.mock('src/views/store', () => ({
  store: {
    dispatch: jest.fn(),
    getState: () => mockStoreState.current,
    subscribe: mockSubscribe,
  },
  USER_LOADED: 'USER_LOADED',
}));

jest.mock('src/components/MessageToasts/actions', () => ({
  addDangerToast: jest.fn(() => ({ type: 'ADD_TOAST' })),
}));

jest.mock('src/components', () => ({ ErrorBoundary: () => null }));

jest.mock('src/components/MessageToasts/ToastContainer', () => () => null);

jest.mock('./EmbeddedContextProviders', () => ({
  EmbeddedContextProviders: () => null,
  getThemeController: () => null,
}));

const mockGetDashboardLoadState = jest.fn();
jest.mock('./api', () => ({
  embeddedApi: { getDashboardLoadState: mockGetDashboardLoadState },
}));

jest.mock('./originValidation', () => ({ validateMessageEvent: () => true }));

jest.mock('./utils', () => ({ getDataMaskChangeTrigger: () => ({}) }));

// The real tracker, wrapped so a test can see whether a store change ran it.
jest.mock('./loadTracker', () => {
  const actual = jest.requireActual('./loadTracker');
  return { ...actual, advanceTracker: jest.fn(actual.advanceTracker) };
});

jest.mock('react-dom/client', () => ({
  createRoot: () => ({ render: jest.fn(), unmount: jest.fn() }),
}));

jest.mock('src/utils/getBootstrapData', () => ({
  __esModule: true,
  default: () => ({
    config: mockConfig,
    embedded: { dashboard_id: '123', allowed_domains: [] },
    common: {
      application_root: '/',
      static_assets_prefix: '/',
      conf: {
        SQLLAB_DEFAULT_DBID: 1,
        DEFAULT_SQLLAB_LIMIT: 1000,
        ...mockCommonConf,
      },
    },
  }),
  applicationRoot: () => '/',
  staticAssetsPrefix: () => '/',
}));

const flush = async () => {
  // Several microtask hops: initPreamble -> dynamic import() -> setup calls.
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

// Drive the postMessage handshake so index.tsx registers its Switchboard methods.
// jsdom lacks MessageChannel, so a minimal fake port is enough here.
function sendHandshake() {
  const port = {} as MessagePort;
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { handshake: 'port transfer' },
      ports: [port],
    }),
  );
}

beforeEach(() => {
  jest.resetModules();
  mockSwitchboard.handler = undefined;
  mockSwitchboard.methods = {};
  mockSetupPlugins.mockReset();
  mockSetupAGGridModules.mockReset();
  mockLogging.error.mockClear();
  mockGetMeWithRole.mockReset();
  mockGetMeWithRole.mockResolvedValue({ result: { roles: {} } });
  mockUiConfig.emitLoadEvents = false;
  mockStoreState.current = { dataMask: {} };
  mockSubscribe.mockClear();
  mockUnsubscribe.mockClear();
  mockEmit.mockClear();
  document.body.innerHTML = '<div id="app"></div>';
});

test('initializes AG Grid modules on bootstrap', async () => {
  mockSetupPlugins.mockImplementation(() => undefined);
  require('./index');
  await flush();

  expect(mockSetupAGGridModules).toHaveBeenCalled();
});

test('retries plugin setup after setupPlugins rejects, then bootstraps the user', async () => {
  // First plugin setup throws; the second attempt (after a re-handshake) succeeds.
  mockSetupPlugins
    .mockImplementationOnce(() => {
      throw new Error('setupPlugins failed');
    })
    .mockImplementation(() => undefined);

  require('./index');
  await flush();

  sendHandshake();
  expect(mockSwitchboard.handler).toBeDefined();

  // First guest token: plugin setup rejects, start() resets the guard and
  // recreates pluginsReady so a retry can re-run setup.
  mockSwitchboard.handler!({ guestToken: 'token-1' });
  await flush();
  expect(mockLogging.error).toHaveBeenCalled();
  expect(mockGetMeWithRole).not.toHaveBeenCalled();
  // The user gets a visible failure message rather than a blank #app.
  expect(document.getElementById('app')!.innerHTML).toContain(
    'Something went wrong loading the dashboard',
  );

  // Second guest token retries: plugin setup now succeeds and the user loads.
  mockSwitchboard.handler!({ guestToken: 'token-2' });
  await flush();
  expect(mockSetupPlugins).toHaveBeenCalledTimes(2);
  expect(mockGetMeWithRole).toHaveBeenCalled();
});

test.each([
  ['short', { status: 400, text: '<html>proxy error</html>' }, false],
  ['short', { status: 401 }, false],
  ['x'.repeat(100), { status: 401 }, false],
  ['x'.repeat(100), { status: 500 }, false],
  ['x'.repeat(100), new SyntaxError('private response body'), true],
])(
  'authentication failure uses size evidence, not response content',
  async (token, error, targeted) => {
    mockGetMeWithRole.mockRejectedValue(error);
    require('./index');
    await flush();
    sendHandshake();
    mockSwitchboard.handler!({ guestToken: token });
    await flush();
    expect(
      document.getElementById('app')!.textContent?.includes('may exceed'),
    ).toBe(targeted);
    expect(JSON.stringify(mockLogging.error.mock.calls)).not.toContain(
      'private response body',
    );
    expect(JSON.stringify(mockLogging.error.mock.calls)).not.toContain(
      '<html>',
    );
    // Failed authentication still permits the existing retry.
    mockGetMeWithRole.mockResolvedValue({ result: { roles: {} } });
    mockSwitchboard.handler!({ guestToken: 'replacement' });
    await flush();
    expect(mockGetMeWithRole).toHaveBeenCalledTimes(2);
  },
);

test('oversized refresh updates diagnostics without restarting successful auth', async () => {
  mockLogging.warn.mockClear();
  require('./index');
  await flush();
  sendHandshake();
  mockSwitchboard.handler!({ guestToken: 'short' });
  await flush();
  mockSwitchboard.handler!({ guestToken: 'x'.repeat(100) });
  await flush();
  expect(mockGetMeWithRole).toHaveBeenCalledTimes(1);
  expect(mockLogging.warn).toHaveBeenLastCalledWith(
    'Guest token exceeds configured request-header budget',
    {
      tokenBytes: 100,
      headerBytes: 118,
      headerBudgetBytes: 100,
      headerBudgetExceeded: true,
    },
  );
  expect(mockSetupClient).toHaveBeenLastCalledWith(
    expect.objectContaining({
      guestToken: 'x'.repeat(100),
      guestTokenHeaderName: 'X-Custom-Guest',
    }),
  );
});

test('opens the realtime socket once the guest client is configured', async () => {
  const socketUrls: string[] = [];
  const originalWebSocket = global.WebSocket;
  global.WebSocket = class {
    send = jest.fn();

    close = jest.fn();

    constructor(socketUrl: string) {
      socketUrls.push(socketUrl);
    }
  } as unknown as typeof WebSocket;
  Object.assign(mockCommonConf, {
    WEBSOCKET_ENABLE: true,
    WEBSOCKET_URL: 'ws://localhost:8080/',
  });
  try {
    require('./index');
    const { SupersetClient } = require('@superset-ui/core');
    const ticketRequest = jest
      .spyOn(SupersetClient, 'get')
      .mockResolvedValue({ json: { token: 'ticket', expires_in: 60 } });
    await flush();
    sendHandshake();
    mockSetupClient.mockClear();

    mockSwitchboard.handler!({ guestToken: 'short' });
    await flush();

    // The ticket is requested with the guest credential, and the socket opens.
    expect(ticketRequest).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/api/v1/realtime/token/' }),
    );
    expect(mockSetupClient.mock.invocationCallOrder[0]).toBeLessThan(
      ticketRequest.mock.invocationCallOrder[0],
    );
    expect(socketUrls).toEqual(['ws://localhost:8080/']);
  } finally {
    require('src/middleware/realtime').resetRealtimeForTests();
    Object.keys(mockCommonConf).forEach(key => delete mockCommonConf[key]);
    global.WebSocket = originalWebSocket;
  }
});

test('async charts load by polling when the guest is refused a realtime ticket', async () => {
  const socketUrls: string[] = [];
  const originalWebSocket = global.WebSocket;
  global.WebSocket = class {
    constructor(socketUrl: string) {
      socketUrls.push(socketUrl);
    }
  } as unknown as typeof WebSocket;
  const flagWindow = window as unknown as {
    featureFlags?: Record<string, boolean>;
  };
  const originalFeatureFlags = flagWindow.featureFlags;
  flagWindow.featureFlags = { GLOBAL_ASYNC_QUERIES: true };
  Object.assign(mockCommonConf, {
    WEBSOCKET_ENABLE: true,
    WEBSOCKET_URL: 'ws://localhost:8080/',
  });
  // The guest role lacks the realtime permission: every ticket request is 403.
  const { SupersetClient } = require('@superset-ui/core');
  const ticketRequest = jest
    .spyOn(SupersetClient, 'get')
    .mockRejectedValue({ status: 403 });
  // `makeApi` is mocked to one handle; answer the status_changes poll (the call
  // carrying a task type) and the guest-user lookup.
  mockGetMeWithRole.mockImplementation(
    async (payload?: { task_type?: string }) =>
      payload?.task_type
        ? { statuses: { 'task-1': { status: 'success' } }, cursor: 'c1' }
        : { result: { roles: {} } },
  );
  try {
    require('./index');
    const { getRealtimeState } = require('src/middleware/realtime');
    const { waitForAsyncData } = require('src/middleware/asyncEvent');
    await flush();
    sendHandshake();
    mockSwitchboard.handler!({ guestToken: 'short' });
    await flush();
    expect(ticketRequest).toHaveBeenCalled();
    expect(getRealtimeState()).toBe('unauthorized');

    const refetch = jest.fn().mockResolvedValue([{ rows: 1 }]);
    await expect(
      waitForAsyncData({ task_ids: ['task-1'], cursor: 'c0' }, refetch),
    ).resolves.toEqual([{ rows: 1 }]);
    expect(mockGetMeWithRole).toHaveBeenCalledWith(
      expect.objectContaining({ task_type: 'superset.query_object_v1' }),
    );
    expect(socketUrls).toEqual([]);
  } finally {
    ticketRequest.mockRestore();
    require('src/middleware/realtime').resetRealtimeForTests();
    Object.keys(mockCommonConf).forEach(key => delete mockCommonConf[key]);
    flagWindow.featureFlags = originalFeatureFlags;
    global.WebSocket = originalWebSocket;
  }
});

test('refresh during pending authentication does not misattribute size evidence', async () => {
  let rejectRequest: (error: unknown) => void = () => {};
  mockGetMeWithRole.mockReturnValue(
    new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }),
  );
  require('./index');
  await flush();
  sendHandshake();
  mockSwitchboard.handler!({ guestToken: 'x'.repeat(100) });
  await flush();
  mockSwitchboard.handler!({ guestToken: 'short' });
  rejectRequest({ status: 400 });
  await flush();
  expect(document.getElementById('app')!.textContent).not.toContain(
    'may exceed',
  );
  expect(mockGetMeWithRole).toHaveBeenCalledTimes(1);

  // Clearing the guard after failure lets a subsequent token retry authentication.
  mockGetMeWithRole.mockResolvedValue({ result: { roles: {} } });
  mockSwitchboard.handler!({ guestToken: 'retry' });
  await flush();
  expect(mockGetMeWithRole).toHaveBeenCalledTimes(2);
});

// Renders the embedded dashboard page component on its own. The real
// createRoot is used because react-dom/client is mocked for index.tsx's own
// bootstrap. React is required after jest.resetModules() so the renderer and
// the component share one React instance. act() runs the component's effects
// before it returns, so the subscription and first emit exist by the time a
// test asserts.
async function renderEmbeddedPage() {
  const { EmbeddedLazyDashboardPage } = require('./index');
  await flush();
  const { act, createElement } = require('react');
  const { createRoot } = jest.requireActual('react-dom/client');
  const root = createRoot(document.createElement('div'));
  act(() => {
    root.render(createElement(EmbeddedLazyDashboardPage));
  });
  return {
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

// A hydrated dashboard without tabs holding chart 1, which failed.
const failedDashboardState = {
  dataMask: {},
  dashboardInfo: { id: 10 },
  dashboardLayout: {
    past: [],
    present: {
      'CHART-1': {
        id: 'CHART-1',
        type: CHART_TYPE,
        parents: ['ROOT_ID', 'GRID_ID'],
        children: [],
        meta: { chartId: 1, sliceName: 'Sales' },
      },
    },
    future: [],
  },
  dashboardState: { activeTabs: [] },
  charts: {
    1: {
      id: 1,
      chartStatus: 'failed',
      chartAlert: 'boom',
      chartUpdateStartTime: 100,
    },
  },
  sliceEntities: { slices: {} },
};

// Plays a store update to every listener the page subscribed.
function notifyStore() {
  mockSubscribe.mock.calls.forEach(([listener]) => listener());
}

beforeAll(() => {
  // The page is rendered with React's own act(), outside Testing Library.
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

test('sends no load events when emitLoadEvents is off', async () => {
  await renderEmbeddedPage();

  expect(mockSubscribe).not.toHaveBeenCalled();
  expect(mockEmit).not.toHaveBeenCalled();
});

test('sends load status changes and chart failures when emitLoadEvents is on', async () => {
  mockUiConfig.emitLoadEvents = true;
  await renderEmbeddedPage();

  // The starting status goes out right away, before any store change.
  expect(mockEmit.mock.calls).toEqual([
    [
      'observeDashboardLoad',
      { status: 'loading', totalCharts: 0, loadedCharts: 0, failedCharts: 0 },
    ],
  ]);

  mockEmit.mockClear();
  mockStoreState.current = failedDashboardState;
  notifyStore();

  expect(mockEmit.mock.calls).toEqual([
    [
      'observeDashboardLoad',
      { status: 'partial', totalCharts: 1, loadedCharts: 0, failedCharts: 1 },
    ],
    [
      'observeChartFailure',
      { chartId: 1, chartName: 'Sales', errorMessage: 'boom' },
    ],
  ]);
});

test('ignores store changes that do not touch the charts, layout, tabs or dashboard', async () => {
  mockUiConfig.emitLoadEvents = true;
  mockStoreState.current = failedDashboardState;
  await renderEmbeddedPage();
  // Same module registry as the page, so this is the spy the page calls.
  const { advanceTracker } = require('./loadTracker');
  advanceTracker.mockClear();

  // Only the filters change; every slice the tracker reads is the same object.
  mockStoreState.current = {
    ...failedDashboardState,
    dataMask: { 'NATIVE_FILTER-1': {} },
  };
  notifyStore();

  expect(advanceTracker).not.toHaveBeenCalled();
});

// Each slice the tracker reads must, on its own, be enough to run it again:
// a chart finishing changes only `charts`, a tab switch only `activeTabs`.
test.each([
  ['charts', { charts: { ...failedDashboardState.charts } }],
  [
    'layout',
    { dashboardLayout: { ...failedDashboardState.dashboardLayout } },
  ],
  ['open tabs', { dashboardState: { activeTabs: ['TAB-1'] } }],
  ['dashboard id', { dashboardInfo: { id: 11 } }],
])(
  'runs the tracker when only the %s change',
  async (_slice, changedSlice) => {
    mockUiConfig.emitLoadEvents = true;
    mockStoreState.current = failedDashboardState;
    await renderEmbeddedPage();
    const { advanceTracker } = require('./loadTracker');
    advanceTracker.mockClear();

    mockStoreState.current = { ...failedDashboardState, ...changedSlice };
    notifyStore();

    expect(advanceTracker).toHaveBeenCalledTimes(1);
  },
);

test('stops listening to the store when the page is removed', async () => {
  mockUiConfig.emitLoadEvents = true;
  const { unmount } = await renderEmbeddedPage();
  expect(mockUnsubscribe).not.toHaveBeenCalled();

  unmount();

  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});

// Hosts call this to read the load state, and a failed call is how they tell
// that a Superset version predates load events.
test('registers getDashboardLoadState on the message channel', async () => {
  require('./index');
  await flush();
  sendHandshake();

  expect(mockSwitchboard.methods.getDashboardLoadState).toBe(
    mockGetDashboardLoadState,
  );
});

test('Switchboard does not log credential-bearing message bodies', async () => {
  require('./index');
  await flush();
  sendHandshake();
  expect(mockSwitchboardInit).toHaveBeenLastCalledWith(
    expect.objectContaining({ debug: false }),
  );
});
