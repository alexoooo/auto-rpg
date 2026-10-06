import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {combatLeague} from './combat-records.mjs';
const args=process.argv.slice(2),at=args.indexOf('--output'),output=at<0?'research/runs/combat-league.json':args[at+1];
const files=at<0?args:args.filter((_,i)=>i!==at&&i!==at+1);
if(!files.length||!output)throw new Error('provide complete combat run files and an output path');
const league={...combatLeague(files.map(file=>JSON.parse(readFileSync(file,'utf8')))),files};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(league,null,2)+'\n');
console.log(JSON.stringify({output,seasons:league.seasons.length,duplicatePairs:league.duplicatePairs}));
