const configured=(import.meta.env.VITE_BACKEND_ORIGIN||'').replace(/\/$/,'');
if(configured){
  const url=new URL(configured);
  if(!['https:','http:'].includes(url.protocol)||url.origin!==configured)throw new Error('VITE_BACKEND_ORIGIN must be a complete HTTP(S) origin without a path.');
}
export const backendOrigin=configured;
export const backendUrl=(path:string)=>backendOrigin+path;
export const liveSocketUrl=()=>{
  const url=new URL(backendUrl('/ws/live'),window.location.origin);
  url.protocol=url.protocol==='https:'?'wss:':'ws:';
  return url.href;
};
