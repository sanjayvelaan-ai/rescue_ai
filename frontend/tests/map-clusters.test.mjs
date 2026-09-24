import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clusterPoints} from '../src/map/clusters.ts';
const point=(id,lat=10,lng=76)=>({survivor_id:id,latitude:lat,longitude:lng});
test('coincident capture records group without changing their coordinates',()=>{
 const points=[point('b'),point('a')];
 const result=clusterPoints(points,20);
 assert.equal(result.length,1);assert.equal(result[0].members.length,2);
 assert.equal(points[0].latitude,10);assert.equal(points[0].longitude,76);
 assert.equal(result[0].key,'a|b');
});
test('nearby tags separate at closer zoom and remain input-order independent',()=>{
 const points=[point('a'),point('b',10.001,76.001)];
 assert.equal(clusterPoints(points,10).length,1);
 assert.equal(clusterPoints(points,20).length,2);
 assert.deepEqual(clusterPoints(points,10),clusterPoints([...points].reverse(),10));
});
test('invalid coordinates cannot break the map',()=>{
 assert.deepEqual(clusterPoints([point('bad',NaN),point('wrong',91)],12),[]);
 assert.equal(clusterPoints([point('a')],12)[0].members[0].survivor_id,'a');
});
test('groups spanning the date line stay at the date line',()=>{
 const result=clusterPoints([point('east',0,179.999),point('west',0,-179.999)],10);
 assert.equal(result.length,1);assert.ok(Math.abs(result[0].longitude)>179);
});
