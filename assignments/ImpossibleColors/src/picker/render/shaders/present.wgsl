// Read four cascade-zero rays, add the core bloom, compress once, encode once.
struct Params { size:vec4u }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> atlas:array<vec4f>;
@group(0) @binding(2) var<storage,read> base:array<vec4f>;
@group(0) @binding(3) var<storage,read> bloom:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> output:array<u32>;
fn probe_light(probe:vec2i)->vec3f {
 let xy=vec2u(clamp(probe,vec2i(0),vec2i(p.size.xy)-1))*2u;var sum=vec3f(0);
 for(var y=0u;y<2u;y++){for(var x=0u;x<2u;x++){sum+=atlas[(xy.y+y)*p.size.x*2u+xy.x+x].rgb;}}
 return sum*.25;
}
fn encode(rgb:vec3f)->vec3f {return select(1.055*pow(max(rgb,vec3f(0)),vec3f(1./2.4))-.055,12.92*rgb,rgb<=vec3f(.0031308));}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id:vec3u) {
 if(any(id.xy>=p.size.zw)){return;}let i=id.y*p.size.z+id.x;let pos=(vec2f(id.xy)+.5)/vec2f(p.size.zw)*vec2f(p.size.xy)-.5;
 let origin=vec2i(floor(pos));let f=fract(pos);
 let light=mix(mix(probe_light(origin),probe_light(origin+vec2i(1,0)),f.x),mix(probe_light(origin+vec2i(0,1)),probe_light(origin+vec2i(1,1)),f.x),f.y)*.4+bloom[i].rgb;
 let a=base[i].a;var rgb=base[i].rgb;
 if(a>0.){rgb=1.-(1.-clamp(rgb,vec3f(0),vec3f(1)))*exp(-max(light,vec3f(0))/a);}
 let encoded=vec4u(round(clamp(vec4f(encode(rgb),a),vec4f(0),vec4f(1))*255.));
 output[i]=encoded.r|(encoded.g<<8u)|(encoded.b<<16u)|(encoded.a<<24u);
}
