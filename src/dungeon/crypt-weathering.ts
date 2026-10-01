import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import { CRYPT_ROOM_LOOK } from "./crypt-archetypes.ts";
import type { CryptRoomPlan } from "./crypt-room.ts";

/** World-space stains follow the actual paving surface, including fractured/sunken pieces. */
export class CryptWeathering extends MaterialPluginBase {
  /** One GLSL `if` a room: inside the room, the stain takes the soil and the strength of the room's kind, and the
   * paving is cleaner along the room's two centre axes. */
  private readonly regions: string;
  constructor(material: Material, plan: CryptRoomPlan) {
    super(material,"CryptWeathering",225,{});
    this.regions=plan.map.rooms.map(r=>{
      const {soil,strength}=CRYPT_ROOM_LOOK[plan.archetypes.find(a=>a.room===r.id)!.kind];
      return `if(p.x>${r.min.x-.5} && p.x<${r.max.x+.5} && p.y>${r.min.z-.5} && p.y<${r.max.z+.5}) {
        soil=vec3(${soil.join(',')});strength=${strength.toFixed(2)};
        traffic=1.0-smoothstep(0.5,1.8,min(abs(p.x-${r.centre.x.toFixed(1)}),abs(p.y-${r.centre.z.toFixed(1)})));
      }`;
    }).join('\n');this._enable(true);
  }
  override getClassName(){return "CryptWeathering";}
  override getCustomCode(shaderType: string){return shaderType==='fragment'?{
    CUSTOM_FRAGMENT_DEFINITIONS:`
      float cryptHash(vec2 p){return fract(sin(dot(p,vec2(41.73,289.1)))*43758.5453);}
      float cryptNoise(vec2 p){vec2 i=floor(p),u=fract(p);u=u*u*(3.0-2.0*u);
        return mix(mix(cryptHash(i),cryptHash(i+vec2(1,0)),u.x),mix(cryptHash(i+vec2(0,1)),cryptHash(i+vec2(1,1)),u.x),u.y);}
      vec3 cryptWeather(vec2 p){
        vec3 soil=vec3(.4,.32,.21);float strength=.35,traffic=0.0;
        ${this.regions??''}
        float broad=cryptNoise(p/2.1+19.7),fine=cryptNoise(p*8.3);
        float stain=smoothstep(.42,.76,broad*.8+cryptNoise(p*.91)*.2+fine*.07);
        return mix(vec3(1.0+traffic*.09),soil,stain*strength*(1.0-traffic*.4));
      }`,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS:'surfaceAlbedo *= cryptWeather(vPositionW.xz);',
  }:null;}
}
