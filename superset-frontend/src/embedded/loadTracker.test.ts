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

// One layout item (chart, row, tab, ...); `parents` is what it sits inside.
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

// A dashboard without tabs:
//   ROW-1
//   ├── chart 1
//   └── chart 2
const flatLayout = toLayout([
  item('ROW-1', ROW_TYPE, ['ROOT_ID', 'GRID_ID']),
  chart(1, ['ROOT_ID', 'GRID_ID', 'ROW-1']),
  chart(2, ['ROOT_ID', 'GRID_ID', 'ROW-1']),
]);

// A dashboard with tabs, and nested tabs inside tab A:
//   TAB-A
//   ├── chart 1
//   ├── TAB-A1 ── chart 3
//   └── TAB-A2 ── chart 4
//   TAB-B
//   └── chart 2
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

// alert = the chart's error text; start = when its latest query started
// (it changes every time the chart re-queries).
type ChartSetup = { status: string | null; alert?: string; start?: number };

// A fake store state. hydrated: false = the dashboard hasn't loaded yet.
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

// Step 1: getVisibleChartIds

test('getVisibleChartIds returns all charts when there are no tabs', () => {
  expect(getVisibleChartIds(flatLayout, [])).toEqual([1, 2]);
});

test('getVisibleChartIds skips charts under an inactive tab', () => {
  // Only tab B is open, so the charts in tab A are hidden.
  expect(getVisibleChartIds(tabbedLayout, ['TAB-B'])).toEqual([2]);
});

test('getVisibleChartIds handles nested tabs', () => {
  // Tab A and inner tab A2 are open, so chart 3 (in A1) is hidden.
  expect(getVisibleChartIds(tabbedLayout, ['TAB-A', 'TAB-A2'])).toEqual([1, 4]);
});

test('getVisibleChartIds counts a chart placed twice once', () => {
  const layout = toLayout([
    chart(1, ['ROOT_ID', 'GRID_ID']),
    { ...chart(1, ['ROOT_ID', 'GRID_ID']), id: 'CHART-copy' },
  ]);
  expect(getVisibleChartIds(layout, [])).toEqual([1]);
});

// Step 2: summarizeLoadState

test('summarizeLoadState is loading before the dashboard hydrates', () => {
  // The charts look finished, but the dashboard itself hasn't loaded yet.
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
  // Chart 2 has the starting status 'loading', or is missing from the store.
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
  // 'stopped' (a cancelled query) counts as loaded.
  const state = makeState({
    charts: { 1: { status: 'success' }, 2: { status: 'stopped' } },
  });
  expect(summarizeLoadState(state).status).toBe('ready');
});

// Step 3: advanceTracker
// Each call passes the previous `next` plus a new state, like store updates
// over time. loadEvent null = no load message to send.

test('advanceTracker emits the status on the first call', () => {
  const { loadEvent } = advanceTracker(
    undefined,
    makeState({ charts: { 1: { status: 'loading' } } }),
  );
  expect(loadEvent?.status).toBe('loading');
});

test('advanceTracker does not emit when only the counts change', () => {
  // Chart 1 finishes, but chart 2 is still waiting, so it stays 'loading'.
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

test('advanceTracker reports nothing before the dashboard loads', () => {
  const { loadEvent, failures } = advanceTracker(
    undefined,
    makeState({ hydrated: false, charts: { 1: { status: 'failed' } } }),
  );
  expect(loadEvent?.status).toBe('loading');
  expect(failures).toEqual([]);
});

test('advanceTracker reports a failed chart only once', () => {
  // Same state twice: the failure is only sent the first time.
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
  // Chart 1 fails, re-queries (new start time), then fails again.
  const first = advanceTracker(
    undefined,
    makeState({
      charts: { 1: { status: 'failed', start: 1 }, 2: { status: 'success' } },
    }),
  );
  const second = advanceTracker(
    first.next,
    makeState({
      charts: { 1: { status: 'loading', start: 2 }, 2: { status: 'success' } },
    }),
  );
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
  // Tab A (chart 1 failed) -> tab B (chart 2 loads) -> back to tab A.
  // Chart 1 never re-queries, so its failure is only sent once.
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
  // A chart's data arrives, then it fails while being drawn.
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
  // Chart 1 failed, but it's in tab A, which is closed.
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

test('advanceTracker reports a failure in a closed tab once the tab opens', () => {
  // Chart 1's failure is hidden on tab B, then reported when tab A opens.
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

test('advanceTracker prefers the layout name and falls back to defaults', () => {
  // Chart 1: the dashboard name beats the saved name. Chart 2 has no name
  // and neither has error text, so the fallbacks are used.
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

test('advanceTracker uses the layout sliceName when slice metadata is missing', () => {
  // No sliceEntities entry for chart 1, but the layout still has its name.
  const layout = toLayout([
    chart(1, ['ROOT_ID'], { sliceName: 'From layout' }),
  ]);
  const { failures } = advanceTracker(
    undefined,
    makeState({ layout, charts: { 1: { status: 'failed' } } }),
  );
  expect(failures.map(f => f.chartName)).toEqual(['From layout']);
});

test('advanceTracker names a chart placed twice after its visible copy', () => {
  // Chart 1 is in both tabs with a different name in each. The tab A copy
  // comes first in the layout, but only tab B is open.
  const layout = toLayout([
    item('TABS-1', TABS_TYPE, ['ROOT_ID']),
    item('TAB-A', TAB_TYPE, ['ROOT_ID', 'TABS-1']),
    item('TAB-B', TAB_TYPE, ['ROOT_ID', 'TABS-1']),
    chart(1, ['ROOT_ID', 'TABS-1', 'TAB-A'], { sliceNameOverride: 'Hidden' }),
    {
      ...chart(1, ['ROOT_ID', 'TABS-1', 'TAB-B'], {
        sliceNameOverride: 'Visible',
      }),
      id: 'CHART-copy',
    },
  ]);
  const { failures } = advanceTracker(
    undefined,
    makeState({
      layout,
      activeTabs: ['TAB-B'],
      charts: { 1: { status: 'failed' } },
    }),
  );
  expect(failures.map(f => f.chartName)).toEqual(['Visible']);
});

test('advanceTracker does not modify the previous state', () => {
  // An earlier result must stay unchanged after a later call.
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
