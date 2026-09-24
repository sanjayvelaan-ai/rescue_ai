import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterRecords,recordBreakdown,recordsCsv} from '../src/lib/record-filters.ts';
const rows=[{survivor_id:'LIVE-a',first_detected:'2026-09-21T12:00:00Z',status:'DETECTED',model_confidence:.8,capture_source:'BROWSER-a',location_source:'DEVICE_LOCATION',latitude:12,longitude:77},{survivor_id:'SIM-b',first_detected:'2026-09-20T12:00:00Z',status:'RESCUED',model_confidence:.6,location_source:'SIMULATION'}];
test('time, confidence and browser-source filters compose',()=>{
 assert.equal(filterRecords(rows,{hours:1,now:Date.parse('2026-09-21T12:30:00Z'),source:'browser',confidence:70}).length,1);
 assert.equal(filterRecords(rows,{status:'RESCUED',source:'browser'}).length,0);
 assert.equal(filterRecords(rows,{confidence:90}).length,0);
});
test('breakdown does not label unlocated detections as geotagged',()=>{
 const result=recordBreakdown([...rows,{...rows[0],location_source:'UNLOCATED'}]);
 assert.equal(result.located,1);assert.deepEqual(result.bins.map(b=>b.count),[0,1,2,0]);
});
test('CSV quotes cells and neutralizes spreadsheet formulas',()=>{
 const csv=recordsCsv([{...rows[0],survivor_id:'=HYPERLINK("bad")',location_source:'UNLOCATED'}]);
 assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(csv.endsWith('"UNLOCATED","",""'));
});
