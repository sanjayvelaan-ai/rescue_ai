import {clusterPoints,type MapPoint} from './clusters.ts';

// Screen-space offsets make every record selectable without inventing GPS fixes.
export function individualTags<T extends MapPoint>(points:T[],zoom:number){
  const size=256*2**zoom;
  return clusterPoints(points,zoom,54).flatMap(group=>{
    if(group.members.length===1)return [{record:group.members[0],latitude:group.members[0].latitude,longitude:group.members[0].longitude,offset:false}];
    const sin=Math.sin(Math.max(-85,Math.min(85,group.latitude))*Math.PI/180);
    const cx=(group.longitude+180)/360*size,cy=(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size;
    let cursor=0,ring=1;
    const tags=[];
    while(cursor<group.members.length){
      const radius=ring*58,count=Math.min(Math.floor(2*Math.PI*radius/58),group.members.length-cursor);
      for(let i=0;i<count;i++){
        const angle=2*Math.PI*i/count-Math.PI/2;
        const x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius;
        tags.push({record:group.members[cursor++],latitude:Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI,longitude:((x/size*360)%360+360)%360-180,offset:true});
      }
      ring++;
    }
    return tags;
  });
}
