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

// step 1
test.todo('getVisibleChartIds returns all charts when there are no tabs');
test.todo('getVisibleChartIds skips charts under an inactive tab');
test.todo('getVisibleChartIds handles nested tabs');
test.todo('getVisibleChartIds counts a chart placed twice once');

// step 2
test.todo('summarizeLoadState is loading before the dashboard hydrates');
test.todo('summarizeLoadState is ready with no visible charts');
test.todo('summarizeLoadState counts a never-started chart as pending');
test.todo('summarizeLoadState is partial when a chart failed');
test.todo('summarizeLoadState is ready when every chart loaded');

// step 3
test.todo('advanceTracker emits the status on the first call');
test.todo('advanceTracker does not emit when only the counts change');
test.todo('advanceTracker reports a failed chart only once');
test.todo('advanceTracker reports a chart again after a reload fails');
test.todo('advanceTracker moves ready to partial when a chart fails after loading');
test.todo('advanceTracker ignores failures in hidden tabs');
