import { Effect } from "@babylonjs/core/Materials/effect.js";

Effect.ShadersStore.proofFireVertexShader = `precision highp float;
attribute vec3 position; attribute vec2 uv; uniform mat4 worldViewProjection; varying vec2 vUV;
void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
Effect.ShadersStore.proofFireFragmentShader = `precision highp float;
varying vec2 vUV; uniform float time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){float y=vUV.y;float x=(vUV.x-.5)*2.;
x+=sin(y*9.-time*3.)*.13*y;
float n=noise(vec2(x*5.,y*7.-time*2.7))*.7+noise(vec2(x*12.,y*18.-time*4.))*.3;
float field=(1.-y)*.78-abs(x)*1.3+(n-.5)*.55;
float a=smoothstep(.0,.18,field)*smoothstep(0.,.06,y);
float core=smoothstep(.15,.72,field);
vec3 c=mix(vec3(2.6,.12,.006),vec3(5.,2.,.28),core);
gl_FragColor=vec4(c,a*.82);}`;
