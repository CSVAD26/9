// Jump flooding, adapted from the MIT vgpu radiance-cascades reference.
struct Params { size:vec4u }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> previous:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> output:array<vec4f>;
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id:vec3u) {
 if(any(id.xy>=p.size.xy)){return;}let i=id.y*p.size.x+id.x;let pos=vec2f(id.xy)+.5;var best=previous[i];var dist=1e9;
 if(best.w>.5){dist=distance(best.xy,pos);}
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
 let n=vec2i(id.xy)+vec2i(x,y)*i32(p.size.z);
 if(any(n<vec2i(0))||any(n>=vec2i(p.size.xy))){continue;}
 let candidate=previous[u32(n.y)*p.size.x+u32(n.x)];let d=distance(candidate.xy,pos);
 if(candidate.w>.5&&d<dist){best=candidate;dist=d;}
 }}output[i]=best;
}
