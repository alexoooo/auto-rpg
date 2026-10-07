/** Delivered whole-step torque is paired with the bounds and starting speeds of that same step. */
export function strikeEffort(driver) {
 const state={steps:0,drivenSteps:0,motor:{excess:0,relativeExcess:0,witness:null},
  anatomy:{excess:0,relativeExcess:0,witness:null},drivenPeaks:{}};
 const sample=(time,phase,driven=phase==='swing')=>{
  if(time<2)return;
  state.steps++;if(driven)state.drivenSteps++;
  for(let i=0;i<driver.channels.length;i++) {
   const torque=driver.pulled[i],sense=torque<0?-1:1,activation=Math.max(0,Math.min(1,driver.activation[i]));
   const motor=(sense>0?driver.bounds.positive:driver.bounds.negative)[i],anatomy=activation*driver.strength(i,sense);
   for(const [key,bound] of [['motor',motor],['anatomy',anatomy]]) {
    const excess=Math.max(0,Math.abs(torque)-bound),relativeExcess=excess/Math.max(1,bound),record=state[key];
    record.excess=Math.max(record.excess,excess);
    if(relativeExcess>record.relativeExcess){record.relativeExcess=relativeExcess;
     record.witness={time,phase,channel:driver.channels[i].name,torque,bound,activation,speed:driver.speed(i)};}
   }
   if(driven)state.drivenPeaks[driver.channels[i].name]=Math.max(state.drivenPeaks[driver.channels[i].name]??0,Math.abs(torque));
  }
 };
 return {state,sample};
}
