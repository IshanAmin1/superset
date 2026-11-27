<!--
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
-->

[![Version](https://img.shields.io/npm/v/%40superset-ui%2Fembedded-sdk?style=flat)](https://www.npmjs.com/package/@superset-ui/embedded-sdk)
[![Libraries.io](https://img.shields.io/librariesio/release/npm/%40superset-ui%2Fembedded-sdk?style=flat)](https://libraries.io/npm/@superset-ui%2Fembedded-sdk)

# Superset Embedded SDK

The Embedded SDK allows you to embed dashboards from Superset into your own app,
using your app's authentication.

Embedding is done by inserting an iframe, containing a Superset page, into the host application.

## Prerequisites

- Activate the feature flag `EMBEDDED_SUPERSET`
- Set a strong password in configuration variable `GUEST_TOKEN_JWT_SECRET` (see configuration file config.py). Be aware that its default value must be changed in production.

## Embedding a Dashboard

Using npm:

```sh
npm install --save @superset-ui/embedded-sdk
```

```js
import { embedDashboard } from "@superset-ui/embedded-sdk";

embedDashboard({
  id: "abc123", // given by the Superset embedding UI
  supersetDomain: "https://superset.example.com",
  mountPoint: document.getElementById("my-superset-container"), // any html element that can contain an iframe
  fetchGuestToken: () => fetchGuestTokenFromBackend(),
  dashboardUiConfig: {
    // dashboard UI config: hideTitle, hideTab, hideChartControls, emitLoadEvents, filters.visible, filters.expanded (optional), urlParams (optional)
    hideTitle: true,
    filters: {
      expanded: true,
    },
    urlParams: {
      foo: "value1",
      bar: "value2",
      // themeMode: 'dark', // set the initial theme: 'dark' | 'system' | 'default' (default: 'default')
      // ...
    },
  },
  // optional additional iframe sandbox attributes
  iframeSandboxExtras: [
    "allow-top-navigation",
    "allow-popups-to-escape-sandbox",
  ],
  // optional Permissions Policy features
  iframeAllowExtras: ["clipboard-write", "fullscreen"],
  // optional config to enforce a particular referrerPolicy
  referrerPolicy: "same-origin",
  // optional callback to customize permalink URLs
  resolvePermalinkUrl: ({ key }) => `https://my-app.com/analytics/share/${key}`,
});
```

You can also load the Embedded SDK from a CDN. The SDK will be available as `supersetEmbeddedSdk` globally:

```html
<script src="https://unpkg.com/@superset-ui/embedded-sdk"></script>

<script>
  supersetEmbeddedSdk.embedDashboard({
    // ... here you supply the same parameters as in the example above
  });
</script>
```

## Authentication/Authorization with Guest Tokens

Embedded resources use a special auth token called a Guest Token to grant Superset access to your users,
without requiring your users to log in to Superset directly. Your backend must create a Guest Token
by requesting Superset's `POST /security/guest_token` endpoint, and pass that guest token to your frontend.

The Embedding SDK takes the guest token and use it to embed a dashboard.

### Creating a Guest Token

From the backend, http `POST` to `/security/guest_token` with some parameters to define what the guest token will grant access to.
Guest tokens can have Row Level Security rules which filter data for the user carrying the token.

The agent making the `POST` request must be authenticated with the `can_grant_guest_token` permission.

Within your app, using the Guest Token will then allow authentication to your Superset instance via creating an Anonymous user object. This guest anonymous user will default to the public role as per this setting `GUEST_ROLE_NAME = "Public"`.

The user parameters in the example below are optional and are provided as a means of passing user attributes that may be accessed in jinja templates inside your charts.

Example `POST /security/guest_token` payload:

```json
{
  "user": {
    "username": "stan_lee",
    "first_name": "Stan",
    "last_name": "Lee"
  },
  "resources": [
    {
      "type": "dashboard",
      "id": "abc123"
    }
  ],
  "rls": [{ "clause": "publisher = 'Nintendo'" }]
}
```

Alternatively, a guest token can be created directly in your app without interacting with the Superset API.
To do this, you should update the `GUEST_TOKEN_JWT_SECRET`
in the Superset [config.py](https://github.com/apache/superset/blob/master/superset/config.py). Also set the
`GUEST_TOKEN_JWT_AUDIENCE` variable that matches what is set for the `aud` in the JSON payload:

```
{
  "user": {
    "username": "embedded@embedded.fr",
    "first_name": "embedded",
    "last_name": "embedded"
  },
  "resources": [
    {
      "type": "dashboard",
      "id": "d73e7841-9342-4afd-8e29-b4a416a2498c"
    }
  ],
  "rls_rules": [],
  "iat": 1730883214,
  "exp": 1732956814,
  "aud": "superset",
  "type": "guest"
}
```

In this example, the configuration file includes the following setting:

```python
GUEST_TOKEN_JWT_AUDIENCE="superset"
```

### Setting the Initial Theme Mode

Use the `themeMode` URL parameter to control the embedded dashboard's initial colour scheme:

```js
embedDashboard({
  id: "abc123",
  supersetDomain: "https://superset.example.com",
  mountPoint: document.getElementById("my-superset-container"),
  fetchGuestToken: () => fetchGuestTokenFromBackend(),
  dashboardUiConfig: {
    urlParams: {
      themeMode: "dark", // 'dark' | 'system' | 'default' (default: 'default')
    },
  },
});
```

The supported values are:

| Value     | Behaviour                                                 |
| --------- | --------------------------------------------------------- |
| `default` | Light theme (Superset default)                            |
| `dark`    | Dark theme                                                |
| `system`  | Follows the user's OS preference (`prefers-color-scheme`) |

The theme can also be changed at runtime via `embeddedDashboard.setThemeMode(mode)`.

### Sandbox iframe

The Embedded SDK creates an iframe with [sandbox](https://developer.mozilla.org/es/docs/Web/HTML/Element/iframe#sandbox) mode by default
which applies certain restrictions to the iframe's content.
To pass additional sandbox attributes you can use `iframeSandboxExtras`:

```js
// optional additional iframe sandbox attributes
iframeSandboxExtras: ["allow-top-navigation", "allow-popups-to-escape-sandbox"];
```

### Permissions Policy

To enable specific browser features within the embedded iframe, use `iframeAllowExtras` to set the iframe's [Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Permissions_Policy) (the `allow` attribute):

```js
// optional Permissions Policy features
iframeAllowExtras: ["clipboard-write", "fullscreen"];
```

Common permissions you might need:

- `clipboard-write` - Required for "Copy permalink to clipboard" functionality
- `fullscreen` - Required for fullscreen chart viewing
- `camera`, `microphone` - If your dashboards include media capture features

### Enforcing a ReferrerPolicy on the request triggered by the iframe

By default, the Embedded SDK creates an `iframe` element without a `referrerPolicy` value enforced. This means that a policy defined for `iframe` elements at the host app level would reflect to it.

This can be an issue as during the embedded enablement for a dashboard it's possible to specify which domain(s) are allowed to embed the dashboard, and this validation happens through the `Referrer` header. That said, in case the hosting app has a more restrictive policy that would omit this header, this validation would fail.

Use the `referrerPolicy` parameter in the `embedDashboard` method to specify [a particular policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy) that works for your implementation.

### Customizing Permalink URLs

When users click share buttons inside an embedded dashboard, Superset generates permalinks using Superset's domain. If you want to use your own domain and URL format for these permalinks, you can provide a `resolvePermalinkUrl` callback:

```js
embedDashboard({
  id: "abc123",
  supersetDomain: "https://superset.example.com",
  mountPoint: document.getElementById("my-superset-container"),
  fetchGuestToken: () => fetchGuestTokenFromBackend(),

  // Customize permalink URLs
  resolvePermalinkUrl: ({ key }) => {
    // key: the permalink key (e.g., "xyz789")
    return `https://my-app.com/analytics/share/${key}`;
  },
});
```

To restore the dashboard state from a permalink in your app:

```js
// In your route handler for /analytics/share/:key
const permalinkKey = routeParams.key;

embedDashboard({
  id: "abc123",
  supersetDomain: "https://superset.example.com",
  mountPoint: document.getElementById("my-superset-container"),
  fetchGuestToken: () => fetchGuestTokenFromBackend(),
  resolvePermalinkUrl: ({ key }) => `https://my-app.com/analytics/share/${key}`,
  dashboardUiConfig: {
    urlParams: {
      permalink_key: permalinkKey, // Restores filters, tabs, chart states, and scrolls to anchor
    },
  },
});
```

## Listening for Dashboard Load Events

Your app can find out when the charts in an embedded dashboard have finished loading, or have failed, without having to keep asking. Turn on `emitLoadEvents`, then register callbacks on the object `embedDashboard` returns:

```js
const dashboard = await embedDashboard({
  id: "abc123",
  supersetDomain: "https://superset.example.com",
  mountPoint: document.getElementById("my-superset-container"),
  fetchGuestToken: () => fetchGuestTokenFromBackend(),
  dashboardUiConfig: {
    emitLoadEvents: true,
  },
});

// Register the callbacks right after embedDashboard resolves
dashboard.observeDashboardLoad((loadState) => {
  // loadState: { status, totalCharts, loadedCharts, failedCharts }
  if (loadState.status === "loading") {
    return;
  }
  hideSpinner();
  if (loadState.status === "partial") {
    showWarning(`${loadState.failedCharts} chart(s) failed to load`);
  }
});

dashboard.observeChartFailure(({ chartId, chartName, errorMessage }) => {
  reportError(`Chart ${chartId} (${chartName}): ${errorMessage}`);
});
```

`hideSpinner`, `showWarning` and `reportError` stand in for your own code.

### Dashboard status

`observeDashboardLoad` receives the dashboard's status, along with how many charts there are and how many have loaded or failed:

| `status`  | Meaning                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `loading` | The dashboard has not finished loading, or at least one chart is still waiting  |
| `partial` | Every chart has finished and at least one failed                                |
| `ready`   | Every chart has finished and none failed (also when the open tab has no charts) |

Only the charts in the tab or tabs the user is looking at are counted. Charts in other tabs are ignored until the user opens that tab. A dashboard without tabs counts every chart. A chart whose query was cancelled counts as loaded.

### When the callbacks are called

- `observeDashboardLoad` is called when the status changes, for example from `loading` to `ready`. Going from 3 of 10 charts loaded to 4 of 10 does not call it. Use `getDashboardLoadState()` for the latest counts.
- `observeChartFailure` is called once for each failed chart query, with the chart's `chartId`, its `chartName` as shown on the dashboard and the `errorMessage` shown on the chart. A chart that is reloaded and fails again is reported again.
- When a chart fails while the dashboard is being drawn, the status changes from `ready` to `partial` and the failure is reported.
- Register the callbacks right after `embedDashboard` resolves. A message that arrives before its callback is registered is dropped.
- If the dashboard navigates to a page of its own and reloads the iframe, your callbacks keep working. Calling `observeDashboardLoad` or `observeChartFailure` again replaces the earlier callback.

### Reading the current state

`getDashboardLoadState()` returns the same object `observeDashboardLoad` receives, as it is at that moment:

```js
const loadState = await dashboard.getDashboardLoadState();
// { status: "loading", totalCharts: 10, loadedCharts: 3, failedCharts: 0 }
```

It works whether or not `emitLoadEvents` is on. Superset versions that predate load events do not know the method, so the call is rejected with an error. Your app can use that to check whether the Superset it embeds supports this feature:

```js
async function supportsLoadEvents(dashboard) {
  try {
    await dashboard.getDashboardLoadState();
    return true;
  } catch {
    return false;
  }
}

if (!(await supportsLoadEvents(dashboard))) {
  // older Superset: no events, so fall back to a fixed wait
  setTimeout(hideSpinner, 8000);
}
```

The call is also rejected if the iframe navigates away before it answers.
