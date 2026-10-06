// Emitter/obstacle distance seeds. Alpha is never used as the obstacle field.
struct Params { size:vec4u }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> emitters:array<vec4f>;
@group(0) @binding(2) var<storage,read> obstacles:array<f32>;
@group(0) @binding(3) var<storage,read_write> seeds:array<vec4f>;
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id:vec3u) {
 if(any(id.xy>=p.size.xy)){return;}let i=id.y*p.size.x+id.x;
 let hit=obstacles[i]>.5 || max(max(emitters[i].r,emitters[i].g),emitters[i].b)>.001;
 seeds[i]=vec4f(vec2f(id.xy)+.5,0.,select(0.,1.,hit));
}
