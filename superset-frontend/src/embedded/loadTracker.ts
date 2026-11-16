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
  DashboardLayout,
  RootState,
} from 'src/dashboard/types';

export type DashboardLoadStatus = 'loading' | 'ready' | 'partial';

export interface DashboardLoadState {
  status: DashboardLoadStatus;
  totalCharts: number;
  loadedCharts: number;
  failedCharts: number;
}

export interface ChartFailure {
  chartId: number;
  chartName: string;
  errorMessage: string;
}

export type LoadTrackerInput = Pick<
  RootState,
  | 'charts'
  | 'dashboardLayout'
  | 'dashboardState'
  | 'dashboardInfo'
  | 'sliceEntities'
>;

export interface TrackerState {
  lastStatus: DashboardLoadStatus;
  reportedFailures: Set<number>;
}

/** Ids of the charts in the visible tab(s). */
export function getVisibleChartIds(
  layout: DashboardLayout,
  activeTabs: ActiveTabs,
): number[] {
  // TODO(step 1): chart items whose TAB parents are all in activeTabs, de-duplicated.
  void layout;
  void activeTabs;
  return [];
}

/** Counts the visible charts and works out the dashboard status. */
export function summarizeLoadState(
  state: LoadTrackerInput,
): DashboardLoadState {
  // TODO(step 2): failed -> failed; success/rendered/stopped -> loaded; else pending.
  // Not hydrated or pending > 0 -> loading; failed > 0 -> partial; else ready.
  void state;
  return { status: 'loading', totalCharts: 0, loadedCharts: 0, failedCharts: 0 };
}

/** Works out which events to emit for one store update. Pass undefined on the first call. */
export function advanceTracker(
  prev: TrackerState | undefined,
  state: LoadTrackerInput,
): {
  next: TrackerState;
  loadEvent: DashboardLoadState | null;
  failures: ChartFailure[];
} {
  // TODO(step 3): emit loadEvent when the status changes; report each newly
  // failed visible chart once; clear reportedFailures when status returns to loading.
  void prev;
  void state;
  return {
    next: { lastStatus: 'loading', reportedFailures: new Set() },
    loadEvent: null,
    failures: [],
  };
}
