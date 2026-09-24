// Only uninterrupted, successfully processed empty frames count as inactivity.
export function createNoDetectionMonitor(waitMs=45000, cooldownMs=180000) {
  let since:number|null=null, previous:number|null=null, notified:number|null=null;
  return {
    reset(){since=null;previous=null;notified=null;},
    observe(now:number, candidates:number, healthy=true){
      if(!healthy||candidates>0){since=null;previous=null;notified=null;return false;}
      if(previous===null||now-previous>10000||now<previous){since=now;notified=null;}
      previous=now;
      if(since!==null&&now-since>=waitMs&&(notified===null||now-notified>=cooldownMs)){
        notified=now;return true;
      }
      return false;
    },
  };
}
