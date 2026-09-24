import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateAnalytics} from '../src/lib/analytics.ts';

const record = (id, score, date, extra = {}) => ({survivor_id:id, model_confidence:score, first_detected:date, timestamp:date, status:'DETECTED', ...extra});

test('empty analytics use unknown averages rather than fabricated zero performance', () => {
  const result = calculateAnalytics([], []);
  assert.equal(result.averageConfidence, null);
  assert.equal(result.averageEta, null);
  assert.deepEqual(result.timeline, []);
});
test('live scope excludes simulation and deduplicates track IDs', () => {
  const rows = [record('LIVE-a', .8, '2026-09-21T01:00:00Z'), record('SIM-a', 1, '2026-09-21T01:00:00Z')];
  const result = calculateAnalytics([...rows, rows[0]], []);
  assert.equal(result.total, 1);
  assert.equal(result.averageConfidence, 80);
  assert.equal(calculateAnalytics(rows, [], false).total, 2);
});
test('timeline sorts first detection dates and groups each minute across days', () => {
  const result = calculateAnalytics([
    record('LIVE-b', .9, '2026-09-22T01:00:00Z'),
    record('LIVE-a', .7, '2026-09-21T01:00:20Z'),
    record('LIVE-c', .8, '2026-09-21T01:00:40Z'),
  ], []);
  assert.deepEqual(result.timeline.map(x=>x.detected), [2,3]);
  assert.ok(result.timeline[0].time < result.timeline[1].time);
});
test('only active valid ETA values contribute and missing scores do not poison averages', () => {
  const result = calculateAnalytics([record('LIVE-a', NaN, 'bad'), record('LIVE-b', .8, 'bad', {status:'RESCUED', detection_frame_path:'/rgb.jpg', thermal_frame_path:'/preview.jpg'})], [
    {name:'Active', status:'EN_ROUTE', eta_seconds:120},
    {name:'Available', status:'AVAILABLE', eta_seconds:999},
    {name:'Broken', status:'EN_ROUTE', eta_seconds:-10},
  ]);
  assert.equal(result.averageEta, 2);
  assert.equal(result.averageConfidence, 80);
  assert.equal(result.rescued, 1);
  assert.equal(result.rgbSnapshots, 1);
  assert.equal(result.previewSnapshots, 1);
  assert.deepEqual(result.timeline, []);
});
