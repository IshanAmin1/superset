# PLAN: Embedded SDK dashboard load events

Team error403 (CSCD01).

**Goal:** let the website that embeds a Superset dashboard (the "host app")
know when the dashboard's charts have finished loading or have failed,
without having to keep asking.

**How:** inside the embedded dashboard, we watch Superset's Redux store (where
the dashboard keeps all its state), work out whether the charts are still
loading, and send messages to the host app. Messages travel over Switchboard,
the message channel the iframe and the host app already use. This copies how
the existing `observeDataMask` feature sends filter changes.

We are using our initial proposal as inspiration for this plan:
https://docs.google.com/document/d/1v6y9HFT1DZ7MX60F5_YWftOZ0aK-rlwk4_p_iKKf6uI/edit?tab=t.0#heading=h.er023qy1sewr

## What the host app receives

```ts
type DashboardLoadStatus = 'loading' | 'ready' | 'partial';

// Sent by observeDashboardLoad, and returned by getDashboardLoadState
interface DashboardLoadState {
  status: DashboardLoadStatus;
  totalCharts: number;   // charts in the tab(s) the user can see
  loadedCharts: number;
  failedCharts: number;
}

// Sent by observeChartFailure
interface ChartFailure {
  chartId: number;
  chartName: string;     // the name shown on the dashboard
  errorMessage: string;  // the error text shown on the chart
}
```

## Rules

**Which charts count:** only charts in the tab(s) the user is looking at.
Charts in other tabs are ignored until the user opens that tab. With nested
tabs, a chart counts only if every tab it sits inside is open. A dashboard
without tabs counts every chart.

**How each chart is classified:** each chart in the store has a
`chartStatus` field. We sort charts into three groups:

| `chartStatus` | Group |
|---|---|
| `success`, `rendered`, `stopped` | loaded |
| `failed` | failed |
| `loading`, empty, or no status yet | still waiting |

A chart that hasn't started loading yet also shows `loading`, so it counts as
still waiting. This stops us from saying "ready" before the charts have even
started.

**Dashboard status:**
1. The dashboard's data hasn't arrived from the server yet, or any chart is
   still waiting → `loading`
2. Any chart failed → `partial`
3. Otherwise → `ready` (also when the open tab has no charts)

**When messages are sent:**
- `observeDashboardLoad`: only when the status changes, for example
  `loading` → `ready`. Going from 3/10 to 4/10 charts loaded sends nothing;
  the host app can call `getDashboardLoadState()` for the latest counts.
- `observeChartFailure`: once for each failed query. Every chart records
  when its latest query started (`chartUpdateStartTime`). A chart that
  reloads and fails again is reported again; a chart that simply stays
  failed (for example while the user switches tabs) is not.
- A chart can fail after its data arrived, while it is being drawn. Then the
  status changes from `ready` to `partial` and the failure is reported.

---

## Area 1: Dashboard state (load tracker)

Plain functions that take the store's state and return a result. They don't
touch the iframe or the message channel, so we can test them with made-up
state.

Files: `superset-frontend/src/embedded/loadTracker.ts`,
`superset-frontend/src/embedded/loadTracker.test.ts`

### Step 1: `getVisibleChartIds(layout, activeTabs)`
- `layout` is the dashboard's layout (every chart, row and tab).
  `activeTabs` is the list of open tabs.
- Keep the layout items that are charts.
- Each item lists the tabs and rows it sits inside (`parents`). Drop a chart
  if any of those tabs is not open.
- Return each chart id only once.
- **Tests:** no tabs, chart in a closed tab, nested tabs, same chart placed
  twice.

### Step 2: `summarizeLoadState(state)`
- Get the visible charts (step 1), sort each into loaded / failed / still
  waiting, and count them.
- Pick the status using the rules above.
- **Tests:** dashboard data not arrived yet, no visible charts, chart that
  hasn't started, one failed chart, all charts loaded.

### Step 3: `advanceTracker(previous, state)`
- Runs every time the store changes. `previous` is what it returned last
  time (nothing on the first run).
- Call `summarizeLoadState` (step 2).
- If the status is different from last time (or this is the first run),
  return a load message.
- For each failed visible chart we haven't reported yet, return a failure
  message.
- Remember each reported failure with its query start time, so the same
  failed query is never reported twice.
- Return what to remember for next time. Don't modify `previous`.
- **Tests:** first run, only the counts changed, failure reported once,
  failure reported again after a reload, no repeat after switching tabs,
  chart fails after loading, failure in a closed tab.

**Done when:** all `loadTracker.test.ts` tests pass, and the type check
(`npm run type`) and lint pass.

---

## Area 2: Frontend API and messages (inside the iframe)

Connects the tracker to the message channel. Nothing changes unless the
host app turns the feature on.

### Step 4: `emitLoadEvents` setting
- File: `superset-frontend/src/components/UiConfigContext/index.tsx`
- The SDK passes its settings to the iframe as one number in the URL, where
  each setting is a bit (1, 2, 4, 8, 16, 32 are already used). Add
  `emitLoadEvents` as `64`.
- **Tests:** 64 turns it on; the other settings are unaffected.

### Step 5: `getDashboardLoadState` API method
- Files: `superset-frontend/src/embedded/api.tsx`,
  `superset-frontend/src/embedded/index.tsx`
- `api.tsx`: return `summarizeLoadState` of the current store state.
- `index.tsx`: register it on the message channel so the host app can call
  it, next to the existing `getChartStates`.
- Works even when the setting is off, so host apps can use it to check
  whether their Superset version supports this feature.
- **Tests (`api.test.ts`):** returns the summary; returns `loading` before
  the dashboard data arrives.

### Step 6: Send the messages
- File: `superset-frontend/src/embedded/index.tsx`
- Add a React `useEffect` next to the existing one for filter changes. It
  only runs when `emitLoadEvents` is on.
- Listen for store changes. Skip changes that don't touch the charts, the
  layout, the open tabs or the dashboard id.
- Call `advanceTracker` and send `observeDashboardLoad` and
  `observeChartFailure` messages to the host app.
- Stop listening when the component is removed.
- **Tests (`index.test.tsx`):** nothing sent when the setting is off;
  messages sent when it is on; stops listening when removed.

---

## Area 3: SDK (host app)

The functions host app developers call.

### Step 7: SDK methods
- File: `superset-embedded-sdk/src/index.ts`
- Add the `emitLoadEvents` setting and send it as `64`.
- Add the message types (copied from the frontend, since the SDK can't
  import frontend code).
- `observeDashboardLoad(callback)` and `observeChartFailure(callback)`:
  register the host's callback the same way `observeDataMask` does. This
  also re-registers it automatically if the iframe reloads.
- `getDashboardLoadState()`: ask the iframe for the current state. On older
  Superset versions the iframe doesn't know this method, so the call fails
  with an error.

### Step 8: SDK tests
- File: `superset-embedded-sdk/src/index.test.ts`
- **Tests:** 64 is added to the iframe URL, callbacks are registered,
  callbacks still work after a reload, `getDashboardLoadState` returns the
  state or fails on older versions.

### Step 9: Docs
- File: `superset-embedded-sdk/README.md`
- Usage example: the setting, both callbacks, and `getDashboardLoadState()`
  to check support.

### Step 10: End-to-end test
- Files: `superset-frontend/playwright/embedded-app/index.html`,
  `superset-frontend/playwright/tests/embedded/embedded-load-events.spec.ts`
- `index.html` is a small test host app the existing end-to-end tests use.
  Let it turn on `emitLoadEvents` from its URL and save the messages it
  receives to `window.__loadEvents`.
- **Test:** a real example dashboard sends `loading` then `ready`, and
  `getDashboardLoadState()` gives the same answer.
