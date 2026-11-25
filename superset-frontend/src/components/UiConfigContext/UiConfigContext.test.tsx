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
import { render } from 'spec/helpers/testing-library';
import { EmbeddedUiConfigProvider, useUiConfig } from '.';

type UiConfig = ReturnType<typeof useUiConfig>;

// Renders the provider with the given `uiConfig` URL param and returns the
// config it hands to its children.
function renderUiConfig(search: string): UiConfig {
  window.history.replaceState({}, '', `/${search}`);
  let config: UiConfig | undefined;
  const Consumer = () => {
    config = useUiConfig();
    return null;
  };
  render(
    <EmbeddedUiConfigProvider>
      <Consumer />
    </EmbeddedUiConfigProvider>,
  );
  return config!;
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

test('emitLoadEvents is off when no uiConfig is passed', () => {
  expect(renderUiConfig('').emitLoadEvents).toBe(false);
});

test('uiConfig=64 turns on emitLoadEvents only', () => {
  expect(renderUiConfig('?uiConfig=64')).toEqual({
    hideTitle: false,
    hideTab: false,
    hideNav: false,
    hideChartControls: false,
    emitDataMasks: false,
    showRowLimitWarning: false,
    emitLoadEvents: true,
  });
});

test('the existing settings do not turn on emitLoadEvents', () => {
  // 63 = 1 + 2 + 4 + 8 + 16 + 32, every setting before emitLoadEvents.
  expect(renderUiConfig('?uiConfig=63')).toEqual({
    hideTitle: true,
    hideTab: true,
    hideNav: true,
    hideChartControls: true,
    emitDataMasks: true,
    showRowLimitWarning: true,
    emitLoadEvents: false,
  });
});
