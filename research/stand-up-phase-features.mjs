/** Local gravity and floor-load shares distinguish recovery postures without a world heading. */
export function phaseFeatures(observation) {
  const q=observation.segments.find(s=>s.name==='lowerTrunk').rotation;
  const norm=q.reduce((s,v)=>s+v*v,0),[x,y,z,w]=q.map((v,i)=>(i===3?v:-v)/norm);
  const gravity=[2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)];
  const loads=Object.fromEntries(observation.segments.map(s=>[s.name,0]));
  for(const c of observation.contacts)if(c.fixed!==null)loads[c.segment]=(loads[c.segment]??0)+c.impulse;
  const total=Object.values(loads).reduce((s,v)=>s+v,0);
  if(total>0)for(const name of Object.keys(loads))loads[name]/=total;
  return {gravity,loads,height:observation.height};
}
