import {test} from 'node:test';
import assert from 'node:assert/strict';
import {individualTags} from '../src/map/tags.ts';
test('each overlapping survivor has its own selectable tag without moving saved coordinates',()=>{
 const records=Array.from({length:30},(_,i)=>({survivor_id:String(i),latitude:12,longitude:77}));
 const tags=individualTags(records,17);
 assert.equal(tags.length,30);
 assert.equal(new Set(tags.map(t=>`${t.latitude},${t.longitude}`)).size,30);
 assert.ok(records.every(p=>p.latitude===12&&p.longitude===77));
 assert.deepEqual(tags,individualTags([...records].reverse(),17));
});
test('isolated tags preserve coordinates and invalid positions are omitted',()=>{
 const p={survivor_id:'a',latitude:12,longitude:77};
 assert.deepEqual(individualTags([p],17),[{record:p,latitude:12,longitude:77,offset:false}]);
 assert.deepEqual(individualTags([{...p,latitude:NaN}],17),[]);
});
