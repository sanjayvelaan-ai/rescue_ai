export type MapPoint = {survivor_id:string; latitude:number; longitude:number};
export const validCoordinates = (p:{latitude:number;longitude:number}) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude)<=90 && Math.abs(p.longitude)<=180;

export function clusterPoints<T extends MapPoint>(points:T[], zoom:number, radius=48) {
  const rows = points.filter(validCoordinates).sort((a,b)=>a.survivor_id.localeCompare(b.survivor_id));
  const size=256*2**zoom;
  const pixels=rows.map(p=>{
    const sin=Math.sin(Math.max(-85,Math.min(85,p.latitude))*Math.PI/180);
    return [(p.longitude+180)/360*size,(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size];
  });
  const parents=rows.map((_,i)=>i);
  const root=(i:number):number=>parents[i]===i?i:(parents[i]=root(parents[i]));
  for(let i=0;i<rows.length;i++) for(let j=0;j<i;j++) {
    const dx=Math.abs(pixels[i][0]-pixels[j][0]);
    if(Math.hypot(Math.min(dx,size-dx),pixels[i][1]-pixels[j][1])<radius) parents[root(i)]=root(j);
  }
  const groups=new Map<number,T[]>();
  rows.forEach((p,i)=>{const key=root(i);groups.set(key,[...(groups.get(key)||[]),p]);});
  return [...groups.values()].map(members=>({
    key:members.map(p=>p.survivor_id).join('|'), members,
    latitude:members.reduce((n,p)=>n+p.latitude,0)/members.length,
    longitude:Math.atan2(members.reduce((n,p)=>n+Math.sin(p.longitude*Math.PI/180),0),members.reduce((n,p)=>n+Math.cos(p.longitude*Math.PI/180),0))*180/Math.PI,
  }));
}
