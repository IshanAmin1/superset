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

import { test, expect } from '@playwright/test';
import {
  apiEnableEmbedding,
  getAccessToken,
  getGuestToken,
} from '../../helpers/api/embedded';
import { getDashboardBySlug } from '../../helpers/api/dashboard';
import { DashboardLoadState, EmbeddedPage } from '../../pages/EmbeddedPage';
import {
  EmbedAppServer,
  SUPERSET_DOMAIN,
  createAdminContext,
  skipUnlessSdkBundleBuilt,
  startEmbedAppServer,
} from '../../helpers/embeddedAppServer';
import { EMBEDDED } from '../../utils/constants';

// Same setup as embedded-dashboard.spec.ts: one static test app server and one
// embedded dashboard shared by every test, so the tests run in order.
test.describe('Embedded dashboard load events', () => {
  test.describe.configure({ mode: 'serial' });

  // Login, guest token, iframe and every chart in the open tab have to load
  // before the dashboard reports ready.
  test.setTimeout(90000);

  let appServer: EmbedAppServer;
  let accessToken: string;
  let embedUuid: string;
  let dashboardId: number;

  test.beforeAll(async ({ browser }) => {
    skipUnlessSdkBundleBuilt();

    appServer = await startEmbedAppServer();

    const context = await createAdminContext(browser);
    const setupPage = await context.newPage();

    try {
      const dashboard = await getDashboardBySlug(setupPage, 'world_health');
      if (!dashboard) {
        throw new Error(
          'Dashboard "world_health" not found. Ensure load_examples ran in CI setup.',
        );
      }
      dashboardId = dashboard.id;

      const embedded = await apiEnableEmbedding(setupPage, dashboardId);
      embedUuid = embedded.uuid;

      accessToken = await getAccessToken(setupPage);
    } finally {
      await context.close();
    }
  });

  test.afterAll(async () => {
    if (appServer) await appServer.close();
  });

  test('host receives loading, then ready, and getDashboardLoadState agrees', async ({
    page,
  }) => {
    const embeddedPage = new EmbeddedPage(page);
    await embeddedPage.exposeTokenFetcher(async () =>
      getGuestToken(page, dashboardId, { accessToken }),
    );
    await embeddedPage.goto({
      appUrl: appServer.url,
      uuid: embedUuid,
      supersetDomain: SUPERSET_DOMAIN,
      emitLoadEvents: true,
    });
    await embeddedPage.waitForIframe();

    // The SDK puts bit 64 in the iframe URL when emitLoadEvents is on
    await expect(
      page.locator('iframe[title="Embedded Dashboard"]'),
    ).toHaveAttribute('src', /uiConfig=64/);

    // Wait until the last event says every visible chart has finished
    await expect
      .poll(
        async () => {
          const events = await embeddedPage.getLoadEvents();
          return events[events.length - 1]?.status;
        },
        { timeout: EMBEDDED.DASHBOARD_RENDER },
      )
      .toMatch(/^(ready|partial)$/);

    const events = await embeddedPage.getLoadEvents();
    const last: DashboardLoadState = events[events.length - 1];

    // The dashboard starts out loading, and only a status change sends an
    // event, so loading always comes first.
    expect(events[0].status).toBe('loading');

    // At the end every chart in the open tab is either loaded or failed
    expect(last.totalCharts).toBeGreaterThan(0);
    expect(last.loadedCharts + last.failedCharts).toBe(last.totalCharts);

    // One failure event per failed chart. Polled because each failure is its
    // own message and can land a moment after the final load event.
    await expect
      .poll(async () => (await embeddedPage.getChartFailures()).length)
      .toBe(last.failedCharts);

    // Asking directly gives the same answer as the last event
    expect(await embeddedPage.getDashboardLoadState()).toEqual(last);
  });

  test('nothing is sent when emitLoadEvents is off', async ({ page }) => {
    const embeddedPage = new EmbeddedPage(page);
    await embeddedPage.exposeTokenFetcher(async () =>
      getGuestToken(page, dashboardId, { accessToken }),
    );
    await embeddedPage.goto({
      appUrl: appServer.url,
      uuid: embedUuid,
      supersetDomain: SUPERSET_DOMAIN,
    });
    await embeddedPage.waitForIframe();
    await embeddedPage.waitForDashboardContent();

    // Once a chart has rendered, the iframe would already have sent at least
    // one event if it were going to.
    await embeddedPage.waitForChartRendered();

    expect(await embeddedPage.getLoadEvents()).toEqual([]);
    expect(await embeddedPage.getChartFailures()).toEqual([]);

    // getDashboardLoadState still answers with the setting off
    const state = await embeddedPage.getDashboardLoadState();
    expect(['loading', 'ready', 'partial']).toContain(state.status);
  });
});
