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
import type { DashboardLayout, LayoutItem } from 'src/dashboard/types';
import {
  CHART_TYPE,
  ROW_TYPE,
  TAB_TYPE,
  TABS_TYPE,
} from 'src/dashboard/util/componentTypes';
import {
  advanceTracker,
  getVisibleChartIds,
  LoadTrackerInput,
  summarizeLoadState,
} from './loadTracker';

const item = (
  id: string,
  type: LayoutItem['type'],
  parents: string[],
  meta: LayoutItem['meta'] = {},
): LayoutItem => ({ id, type, parents, children: [], meta });

const chart = (chartId: number, parents: string[], meta = {}) =>
  item(`CHART-${chartId}`, CHART_TYPE, parents, { chartId, ...meta });

const toLayout = (items: LayoutItem[]): DashboardLayout =>
  Object.fromEntries(items.map(i => [i.id, i]));

// No tabs: charts 1 and 2 in a row.
const flatLayout = toLayout([
  item('ROW-1', ROW_TYPE, ['ROOT_ID', 'GRID_ID']),
  chart(1, ['ROOT_ID', 'GRID_ID', 'ROW-1']),
  chart(2, ['ROOT_ID', 'GRID_ID', 'ROW-1']),
]);

// Tabs A and B; chart 1 in A, chart 2 in B, and inside A a nested tab
// group with chart 3 in A1 and chart 4 in A2.
const tabbedLayout = toLayout([
  item('TABS-1', TABS_TYPE, ['ROOT_ID']),
  item('TAB-A', TAB_TYPE, ['ROOT_ID', 'TABS-1']),
  item('TAB-B', TAB_TYPE, ['ROOT_ID', 'TABS-1']),
  item('TABS-2', TABS_TYPE, ['ROOT_ID', 'TABS-1', 'TAB-A']),
  item('TAB-A1', TAB_TYPE, ['ROOT_ID', 'TABS-1', 'TAB-A', 'TABS-2']),
  item('TAB-A2', TAB_TYPE, ['ROOT_ID', 'TABS-1', 'TAB-A', 'TABS-2']),
  chart(1, ['ROOT_ID', 'TABS-1', 'TAB-A']),
  chart(2, ['ROOT_ID', 'TABS-1', 'TAB-B']),
  chart(3, ['ROOT_ID', 'TABS-1', 'TAB-A', 'TABS-2', 'TAB-A1']),
  chart(4, ['ROOT_ID', 'TABS-1', 'TAB-A', 'TABS-2', 'TAB-A2']),
]);

// `start` is the chart's chartUpdateStartTime: it changes on every re-query.
type ChartSetup = { status: string | null; alert?: string; start?: number };

function makeState({
  layout = flatLayout,
  activeTabs = [],
  charts = {},
  hydrated = true,
  names = {},
}: {
  layout?: DashboardLayout;
  activeTabs?: string[];
  charts?: Record<number, ChartSetup>;
  hydrated?: boolean;
  names?: Record<number, string>;
}): LoadTrackerInput {
  return {
    dashboardInfo: { id: hydrated ? 10 : undefined },
    dashboardLayout: { past: [], present: layout, future: [] },
    dashboardState: { activeTabs },
    charts: Object.fromEntries(
      Object.entries(charts).map(([id, { status, alert, start }]) => [
        id,
        {
          id: Number(id),
          chartStatus: status,
          chartAlert: alert ?? null,
          chartUpdateStartTime: start ?? 0,
        },
      ]),
    ),
    sliceEntities: {
      slices: Object.fromEntries(
        Object.entries(names).map(([id, name]) => [id, { slice_name: name }]),
      ),
    },
  } as unknown as LoadTrackerInput;
}

// step 1: getVisibleChartIds

test('getVisibleChartIds returns all charts when there are no tabs', () => {
  expect(getVisibleChartIds(flatLayout, [])).toEqual([1, 2]);
});

test('getVisibleChartIds skips charts under an inactive tab', () => {
  expect(getVisibleChartIds(tabbedLayout, ['TAB-B'])).toEqual([2]);
});

test('getVisibleChartIds handles nested tabs', () => {
  expect(getVisibleChartIds(tabbedLayout, ['TAB-A', 'TAB-A2'])).toEqual([1, 4]);
});

test('getVisibleChartIds counts a chart placed twice once', () => {
  const layout = toLayout([
    chart(1, ['ROOT_ID', 'GRID_ID']),
    { ...chart(1, ['ROOT_ID', 'GRID_ID']), id: 'CHART-copy' },
  ]);
  expect(getVisibleChartIds(layout, [])).toEqual([1]);
});

// step 2: summarizeLoadState

test('summarizeLoadState is loading before the dashboard hydrates', () => {
  const state = makeState({
    hydrated: false,
    charts: { 1: { status: 'success' }, 2: { status: 'success' } },
  });
  expect(summarizeLoadState(state)).toEqual({
    status: 'loading',
    totalCharts: 0,
    loadedCharts: 0,
    failedCharts: 0,
  });
});

test('summarizeLoadState is ready with no visible charts', () => {
  const state = makeState({ layout: {} });
  expect(summarizeLoadState(state).status).toBe('ready');
});

test('summarizeLoadState counts a never-started chart as pending', () => {
  // chart 2 has the hydrate default status; it has no entry at all in the
  // second case
  const defaultStatus = makeState({
    charts: { 1: { status: 'success' }, 2: { status: 'loading' } },
  });
  const missing = makeState({ charts: { 1: { status: 'success' } } });
  expect(summarizeLoadState(defaultStatus)).toEqual({
    status: 'loading',
    totalCharts: 2,
    loadedCharts: 1,
    failedCharts: 0,
  });
  expect(summarizeLoadState(missing).status).toBe('loading');
});

test('summarizeLoadState is partial when a chart failed', () => {
  const state = makeState({
    charts: { 1: { status: 'rendered' }, 2: { status: 'failed' } },
  });
  expect(summarizeLoadState(state)).toEqual({
    status: 'partial',
    totalCharts: 2,
    loadedCharts: 1,
    failedCharts: 1,
  });
});

test('summarizeLoadState is ready when every chart loaded', () => {
  const state = makeState({
    charts: { 1: { status: 'success' }, 2: { status: 'stopped' } },
  });
  expect(summarizeLoadState(state).status).toBe('ready');
});

// step 3: advanceTracker

test('advanceTracker emits the status on the first call', () => {
  const { loadEvent } = advanceTracker(
    undefined,
    makeState({ charts: { 1: { status: 'loading' } } }),
  );
  expect(loadEvent?.status).toBe('loading');
});

test('advanceTracker does not emit when only the counts change', () => {
  const first = advanceTracker(
    undefined,
    makeState({ charts: { 1: { status: 'loading' } } }),
  );
  const second = advanceTracker(
    first.next,
    makeState({ charts: { 1: { status: 'success' } } }),
  );
  expect(second.loadEvent).toBeNull();
});

test('advanceTracker reports a failed chart only once', () => {
  const failed = makeState({
    charts: {
      1: { status: 'failed', alert: 'Boom' },
      2: { status: 'loading' },
    },
    names: { 1: 'Sales' },
  });
  const first = advanceTracker(undefined, failed);
  const second = advanceTracker(first.next, failed);

  expect(first.failures).toEqual([
    { chartId: 1, chartName: 'Sales', errorMessage: 'Boom' },
  ]);
  expect(second.failures).toEqual([]);
});

test('advanceTracker reports a chart again after a reload fails', () => {
  const first = advanceTracker(
    undefined,
    makeState({
      charts: { 1: { status: 'failed', start: 1 }, 2: { status: 'success' } },
    }),
  );
  // chart 1 re-queries (new start time) ...
  const second = advanceTracker(
    first.next,
    makeState({
      charts: { 1: { status: 'loading', start: 2 }, 2: { status: 'success' } },
    }),
  );
  // ... and fails again
  const third = advanceTracker(
    second.next,
    makeState({
      charts: { 1: { status: 'failed', start: 2 }, 2: { status: 'success' } },
    }),
  );

  expect(second.loadEvent?.status).toBe('loading');
  expect(third.loadEvent?.status).toBe('partial');
  expect(third.failures.map(f => f.chartId)).toEqual([1]);
});

test('advanceTracker does not report the same failure again after switching tabs', () => {
  const state = (activeTab: string, chart2Status: string) =>
    makeState({
      layout: tabbedLayout,
      activeTabs: [activeTab],
      charts: {
        1: { status: 'failed', start: 1 },
        2: { status: chart2Status, start: 1 },
      },
    });

  const onTabA = advanceTracker(undefined, state('TAB-A', 'loading'));
  const tabBLoading = advanceTracker(onTabA.next, state('TAB-B', 'loading'));
  const tabBLoaded = advanceTracker(
    tabBLoading.next,
    state('TAB-B', 'success'),
  );
  const backToTabA = advanceTracker(tabBLoaded.next, state('TAB-A', 'success'));

  expect(onTabA.failures.map(f => f.chartId)).toEqual([1]);
  expect(tabBLoading.loadEvent?.status).toBe('loading');
  expect(backToTabA.loadEvent?.status).toBe('partial');
  expect(backToTabA.failures).toEqual([]);
});

test('advanceTracker moves ready to partial when a chart fails after loading', () => {
  const ready = advanceTracker(
    undefined,
    makeState({
      charts: { 1: { status: 'success' }, 2: { status: 'success' } },
    }),
  );
  const renderFailed = advanceTracker(
    ready.next,
    makeState({
      charts: { 1: { status: 'failed' }, 2: { status: 'success' } },
    }),
  );

  expect(ready.loadEvent?.status).toBe('ready');
  expect(renderFailed.loadEvent?.status).toBe('partial');
  expect(renderFailed.failures.map(f => f.chartId)).toEqual([1]);
});

test('advanceTracker ignores failures in hidden tabs', () => {
  const { loadEvent, failures } = advanceTracker(
    undefined,
    makeState({
      layout: tabbedLayout,
      activeTabs: ['TAB-B'],
      charts: { 1: { status: 'failed' }, 2: { status: 'success' } },
    }),
  );
  expect(loadEvent?.status).toBe('ready');
  expect(failures).toEqual([]);
});

test('advanceTracker prefers the layout name and falls back to defaults', () => {
  const layout = toLayout([
    chart(1, ['ROOT_ID'], { sliceNameOverride: 'Renamed' }),
    chart(2, ['ROOT_ID']),
  ]);
  const { failures } = advanceTracker(
    undefined,
    makeState({
      layout,
      charts: { 1: { status: 'failed' }, 2: { status: 'failed' } },
      names: { 1: 'Saved name' },
    }),
  );
  expect(failures).toEqual([
    { chartId: 1, chartName: 'Renamed', errorMessage: 'Unknown error' },
    { chartId: 2, chartName: 'Chart 2', errorMessage: 'Unknown error' },
  ]);
});

test('summarizeLoadState counts null and empty statuses as waiting', () => {
  const state = makeState({
    charts: { 1: { status: null }, 2: { status: '' } },
  });
  expect(summarizeLoadState(state)).toEqual({
    status: 'loading',
    totalCharts: 2,
    loadedCharts: 0,
    failedCharts: 0,
  });
});

test('advanceTracker reports nothing before the dashboard loads', () => {
  const { loadEvent, failures } = advanceTracker(
    undefined,
    makeState({ hydrated: false, charts: { 1: { status: 'failed' } } }),
  );
  expect(loadEvent?.status).toBe('loading');
  expect(failures).toEqual([]);
});

test('advanceTracker reports a failure in a closed tab once the tab opens', () => {
  const charts = { 1: { status: 'failed' }, 2: { status: 'success' } };
  const onTabB = advanceTracker(
    undefined,
    makeState({ layout: tabbedLayout, activeTabs: ['TAB-B'], charts }),
  );
  const onTabA = advanceTracker(
    onTabB.next,
    makeState({ layout: tabbedLayout, activeTabs: ['TAB-A'], charts }),
  );

  expect(onTabB.failures).toEqual([]);
  expect(onTabA.failures.map(f => f.chartId)).toEqual([1]);
});

test('advanceTracker does not modify the previous state', () => {
  const first = advanceTracker(
    undefined,
    makeState({
      charts: { 1: { status: 'loading' }, 2: { status: 'loading' } },
    }),
  );
  const before = new Map(first.next.reportedFailures);
  advanceTracker(
    first.next,
    makeState({
      charts: { 1: { status: 'failed' }, 2: { status: 'loading' } },
    }),
  );
  expect(first.next.reportedFailures).toEqual(before);
  expect(first.next.lastStatus).toBe('loading');
});
