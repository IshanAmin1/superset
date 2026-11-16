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

import type {
  ActiveTabs,
  Chart,
  DashboardLayout,
  LayoutItem,
  RootState,
} from 'src/dashboard/types';
import { CHART_TYPE, TAB_TYPE } from 'src/dashboard/util/componentTypes';

/** loading: still waiting on charts; partial: done with failures; ready: all loaded. */
export type DashboardLoadStatus = 'loading' | 'ready' | 'partial';

/** Sent by observeDashboardLoad and returned by getDashboardLoadState. */
export interface DashboardLoadState {
  status: DashboardLoadStatus;
  totalCharts: number;
  loadedCharts: number;
  failedCharts: number;
}

/** Sent by observeChartFailure, once per failed chart. */
export interface ChartFailure {
  chartId: number;
  chartName: string;
  errorMessage: string;
}

/** The parts of the Redux store the tracker reads to determine the dashboard's load state. */
export type LoadTrackerInput = Pick<
  RootState,
  | 'charts'
  | 'dashboardLayout'
  | 'dashboardState'
  | 'dashboardInfo'
  | 'sliceEntities'
>;

/** What the tracker remembers between store updates. */
export interface TrackerState {
  lastStatus: DashboardLoadStatus;
  /** Chart id -> start time of the failed query already reported for it. */
  reportedFailures: Map<number, number>;
}

type ChartGroup = 'loaded' | 'failed' | 'waiting';

// `stopped` means the query was cancelled, which is finished but not an error.
const LOADED_STATUSES = ['success', 'rendered', 'stopped'];

/**
 * Sorts a chart into one of three groups: loaded, failed or waiting.
 */
function getChartGroup(chart: Chart | undefined): ChartGroup {
  const status = chart?.chartStatus;
  if (status === 'failed') return 'failed';
  if (status && LOADED_STATUSES.includes(status)) return 'loaded';
  return 'waiting';
}

/** Returns true if the item sits inside a tab that is not open. */
function isInClosedTab(
  item: LayoutItem,
  layout: DashboardLayout,
  openTabs: Set<string>,
): boolean {
  // items `parents` field lists everything the chart sits inside (e.g. ROOT_ID, TABS-1,
  // TAB-A, ROW-1). The chart is considered hidden if any of them is a closed tab.
  return (item.parents ?? []).some(parentId => {
    const isTab = layout[parentId]?.type === TAB_TYPE;
    return isTab && !openTabs.has(parentId);
  });
}

/** Returns the ids of the charts in the open tab(s), each id once.
 *  This function returns charts the user can see, not all charts in the layout.
 */
export function getVisibleChartIds(
  layout: DashboardLayout,
  activeTabs: ActiveTabs,
): number[] {
  const openTabs = new Set(activeTabs);
  const chartIds = new Set<number>();

  // Go through the layout and find all charts that are not inside a closed tab.
  Object.values(layout).forEach(item => {
    const chartId = item?.meta?.chartId;
    if (item?.type !== CHART_TYPE || !chartId) return;

    // If the chart is not inside a closed tab, add it to the set of visible charts.
    if (!isInClosedTab(item, layout, openTabs)) {
      chartIds.add(chartId);
    }
  });

  // Return the chart ids of the visible charts
  return Array.from(chartIds);
}

/** Reads the layout and open tabs from the store and returns the visible chart ids. */
function getVisibleCharts(state: LoadTrackerInput): number[] {
  const layout = state.dashboardLayout?.present ?? {};
  const activeTabs = state.dashboardState?.activeTabs ?? [];
  return getVisibleChartIds(layout, activeTabs);
}

/** Counts the visible charts and works out the dashboard status. */
export function summarizeLoadState(
  state: LoadTrackerInput,
): DashboardLoadState {
  // No dashboard id means the dashboard hasn't loaded yet. Its layout is
  // still empty, which would otherwise look like "ready".
  if (!state.dashboardInfo?.id) {
    return {
      status: 'loading',
      totalCharts: 0,
      loadedCharts: 0,
      failedCharts: 0,
    };
  }

  // Count the visible charts and how many are loaded, failed or waiting.
  const chartIds = getVisibleCharts(state);
  let loadedCharts = 0;
  let failedCharts = 0;
  let waitingCharts = 0;

  chartIds.forEach(chartId => {
    const group = getChartGroup(state.charts[chartId]);
    if (group === 'loaded') {
      loadedCharts += 1;
    } else if (group === 'failed') {
      failedCharts += 1;
    } else {
      waitingCharts += 1;
    }
  });

  // Decide the overall dashboard status based on the counts.
  let status: DashboardLoadStatus;
  if (waitingCharts > 0) {
    status = 'loading';
  } else if (failedCharts > 0) {
    status = 'partial';
  } else {
    status = 'ready';
  }

  // Return the summary of the dashboard's load state.
  return {
    status,
    totalCharts: chartIds.length,
    loadedCharts,
    failedCharts,
  };
}

/** Returns the chart's name, preferring a name set on the dashboard. */
function getChartName(state: LoadTrackerInput, chartId: number): string {
  const chartItem = Object.values(state.dashboardLayout.present).find(
    item => item.type === CHART_TYPE && item.meta.chartId === chartId,
  );
  // A name set on the dashboard wins over the chart's saved name.
  const dashboardName = chartItem?.meta.sliceNameOverride;
  const savedName = state.sliceEntities.slices[chartId]?.slice_name;
  return dashboardName || savedName || `Chart ${chartId}`;
}

/** Builds the failure message for one chart. */
function toChartFailure(
  state: LoadTrackerInput,
  chartId: number,
): ChartFailure {
  return {
    chartId,
    chartName: getChartName(state, chartId),
    errorMessage: state.charts[chartId]?.chartAlert || 'Unknown error',
  };
}

/**
 * Works out which messages to send after a store update. Pass the previous
 * `next` back in as `prev` (undefined on the first call).
 */
export function advanceTracker(
  prev: TrackerState | undefined,
  state: LoadTrackerInput,
): {
  next: TrackerState;
  loadEvent: DashboardLoadState | null;
  failures: ChartFailure[];
} {
  // Summarize the dashboard's load state and compare it to the previous state.
  const summary = summarizeLoadState(state);
  const isFirstCall = prev === undefined;

  // Copy the map so the previous state is never changed.
  const reportedFailures = new Map<number, number>(prev?.reportedFailures);

  // Report each failed query once. A chart's chartUpdateStartTime changes
  // every time it re-queries, so a chart that reloads and fails again is
  // reported again, while one that simply stays failed (e.g. while the user
  // switches tabs) is not.
  const failures: ChartFailure[] = [];
  if (state.dashboardInfo?.id) {
    getVisibleCharts(state).forEach(chartId => {
      const chart = state.charts[chartId];
      const hasFailed = getChartGroup(chart) === 'failed';
      const queryStartTime = chart?.chartUpdateStartTime ?? 0;
      const alreadyReported = reportedFailures.get(chartId) === queryStartTime;
      if (hasFailed && !alreadyReported) {
        reportedFailures.set(chartId, queryStartTime);
        failures.push(toChartFailure(state, chartId));
      }
    });
  }

  // Only send a load message when the status changes (always on the first call).
  let loadEvent: DashboardLoadState | null = null;
  if (isFirstCall || prev.lastStatus !== summary.status) {
    loadEvent = summary;
  }

  // Return the new tracker state, any load message and any new failures.
  return {
    next: { lastStatus: summary.status, reportedFailures },
    loadEvent,
    failures,
  };
}
