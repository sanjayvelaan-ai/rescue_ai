import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNoDetectionMonitor} from '../src/lib/no-detection.ts';
test('quiet notification follows 45 seconds of healthy empty frames, then cools down',()=>{
  const m=createNoDetectionMonitor();
  for(let n=0;n<45000;n+=1000)assert.equal(m.observe(n,0),false);
  assert.equal(m.observe(45000,0),true);
  for(let n=46000;n<225000;n+=1000)assert.equal(m.observe(n,0),false);
  assert.equal(m.observe(225000,0),true);
});
test('detections, outages and a new capture session reset the quiet interval',()=>{
  for(const interruption of ['person','error','gap','restart']){
    const m=createNoDetectionMonitor();
    for(let n=0;n<=44000;n+=1000)m.observe(n,0);
    if(interruption==='person')m.observe(45000,1);
    if(interruption==='error')m.observe(45000,0,false);
    if(interruption==='restart')m.reset();
    assert.equal(m.observe(60000,0),false,interruption);
    for(let n=61000;n<105000;n+=1000)assert.equal(m.observe(n,0),false);
    assert.equal(m.observe(105000,0),true);
  }
});
