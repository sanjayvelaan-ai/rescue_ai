import type {Survivor} from '../types';
export function filterRecords(records:Survivor[],{hours=0,confidence=0,status='all',source='all',now=Date.now()}:{hours?:number;confidence?:number;status?:string;source?:string;now?:number}){
  return records.filter(s=>{
    const time=Date.parse(s.first_detected||s.timestamp);
    return (!hours||(Number.isFinite(time)&&time>=now-hours*3600000&&time<=now))
      && s.model_confidence*100>=confidence
      && (status==='all'||s.status===status)
      && (source==='all'||(source==='browser'?(s.capture_source||'').startsWith('BROWSER-'):s.survivor_id.startsWith('LIVE-')));
  });
}
export function recordBreakdown(records:Survivor[]){
  const statuses=new Map<string,number>();
  const bins=[{name:'0–49%',count:0},{name:'50–69%',count:0},{name:'70–89%',count:0},{name:'90–100%',count:0}];
  for(const s of records){statuses.set(s.status,(statuses.get(s.status)||0)+1);const c=s.model_confidence;if(Number.isFinite(c)&&c>=0&&c<=1)bins[c<.5?0:c<.7?1:c<.9?2:3].count++;}
  return {statuses:[...statuses].map(([name,count])=>({name,count})),bins,located:records.filter(s=>['DEVICE_LOCATION','USER_PIN'].includes(s.location_source||'')).length};
}
export function recordsCsv(records:Survivor[]){
  const escape=(value:unknown)=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  return [['track_id','first_detected','status','confidence','camera_source','location_source','latitude','longitude'],...records.map(s=>[s.survivor_id,s.first_detected||s.timestamp,s.status,s.model_confidence,s.capture_source||'SERVER_CAMERA',s.location_source||'SIMULATION',s.location_source==='UNLOCATED'?'':s.latitude,s.location_source==='UNLOCATED'?'':s.longitude])].map(row=>row.map(escape).join(',')).join('\r\n');
}
export function downloadRecords(records:Survivor[],filename='rescue-records.csv'){
  const url=URL.createObjectURL(new Blob([recordsCsv(records)],{type:'text/csv;charset=utf-8;'}));
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
