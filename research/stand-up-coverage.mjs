import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import assert from'node:assert/strict';
import{recoveryTrial}from'./stand-up-campaign.mjs';
const [prefixPath,manifestPath,output]=process.argv.slice(2);
if(!output)throw new Error('prefix report, manifest and audit output required');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')),prefix=JSON.parse(readFileSync(prefixPath,'utf8'));
assert.equal(prefix.configuration.prefixOnly,true);assert.equal(prefix.records.length,128);
const key=c=>JSON.stringify(c),byCase=new Map(prefix.records.map(r=>[key(r.case),r]));
const selected=manifest.validation.map(c=>{const r=byCase.get(key(c));assert.ok(r,'every frozen case has a prefix');return r;}),trials=[],replacements=[];
const poses=['prone','supine','left-side','right-side'],before=createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
const write=()=>writeFileSync(output,JSON.stringify({before,replacements,trials,selectedPrefixes:selected},null,2));
for(const model of ['workshop-fighter','workshop-rogue'])for(const held of ['empty','club']){
 const belongs=r=>r.case.model===model&&r.case.held===held;
 for(const pose of poses){
  if(selected.some(r=>belongs(r)&&r.result.fell&&r.initialPose===pose))continue;
  let replacement=null;
  for(const c of manifest.coverageReservations.filter(c=>c.model===model&&c.held===held)){
   let r=trials.find(r=>key(r.case)===key(c));
   if(!r){r=await recoveryTrial(prefix.configuration,c,prefix.policySha,manifest.fallbackRecipes);trials.push(r);write();}
   if(r.result.fell&&r.initialPose===pose){replacement=r;break;}
  }
  assert.ok(replacement,`reserved prefixes do not cover ${model}/${held}/${pose}`);
  let index=selected.findIndex(r=>belongs(r)&&(!r.result.fell||!poses.includes(r.initialPose)));
  if(index<0){const counts=Object.fromEntries(poses.map(p=>[p,selected.filter(r=>belongs(r)&&r.initialPose===p).length]));const common=poses.toSorted((a,b)=>counts[b]-counts[a])[0];assert.ok(counts[common]>1);index=selected.findLastIndex(r=>belongs(r)&&r.initialPose===common);}
  replacements.push({index,excluded:selected[index].case,replacement:replacement.case,pose});selected[index]=replacement;write();
 }
}
if(replacements.length){manifest.originalValidation??=manifest.validation;manifest.validation=selected.map(r=>r.case);manifest.coverageReplacements=replacements;writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');}
write();console.log(JSON.stringify({replacements:replacements.length,coverage:Object.fromEntries(['workshop-fighter','workshop-rogue'].flatMap(m=>['empty','club'].map(h=>[m+'/'+h,poses.map(p=>[p,selected.filter(r=>r.case.model===m&&r.case.held===h&&r.initialPose===p&&r.result.fell).length])])))}));
