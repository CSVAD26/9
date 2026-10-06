// Six-level visibility-aware radiance cascades, adapted from vgpu (MIT).
// Reference https://vgpu.sh/examples/radiance-cascades
// Geometric intervals, direction atlas, bilinear upper-probe merge and four children
// follow the reference. This storage-buffer port keeps independent photo obstacles.
struct Params { size:vec4u }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> emitters:array<vec4f>;
@group(0) @binding(2) var<storage,read> seeds:array<vec4f>;
@group(0) @binding(3) var<storage,read> upper:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> output:array<vec4f>;
fn sample_distance(pos:vec2f)->f32 {
 let xy=vec2u(clamp(floor(pos),vec2f(0),vec2f(p.size.xy)-1));
 let seed=seeds[xy.y*p.size.x+xy.x];
 return select(1e5,max(0.,distance(seed.xy,pos)-.75),seed.w>.5);
}
fn trace(origin:vec2f,direction:vec2f,level:f32)->vec4f {
 var t=2.*(pow(4.,level)-1.)/3.;let end=t+2.*pow(4.,level)*1.02;
 for(var step=0;step<192;step++){
 let pos=origin+direction*t;
 if(any(pos<vec2f(0))||any(pos>=vec2f(p.size.xy))||t>end){break;}
 let dist=sample_distance(pos);
 if(dist<=.01){let xy=vec2u(pos);return vec4f(emitters[xy.y*p.size.x+xy.x].rgb,0.);}
 t+=max(.35,dist);
 }return vec4f(0,0,0,1);
}
fn atlas_texel(probe:vec2f,direction:f32,block:f32)->vec2u {
 return vec2u(probe*block+vec2f(direction%block,floor(direction/block)));
}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id:vec3u) {
 let atlas=p.size.xy*2u;if(any(id.xy>=atlas)){return;}
 let level=f32(p.size.z);let block=pow(2.,level+1.);let spacing=pow(2.,level);
 let texel=vec2f(id.xy);let probe=floor(texel/block);let slot=texel-probe*block;let index=slot.y*block+slot.x;
 let theta=6.28318530718*(index+.5)/pow(4.,level+1.);let origin=(probe+.5)*spacing;
 var near=trace(origin,vec2f(cos(theta),sin(theta)),level);
 if(p.size.z<5u && near.a>0.) {
 let upperBlock=block*2.;let grid=vec2f(atlas)/upperBlock;let position=origin/(spacing*2.)-.5;let base=floor(position);let f=clamp(position-base,vec2f(0),vec2f(1));
 let weights=array<f32,4>((1.-f.x)*(1.-f.y),f.x*(1.-f.y),(1.-f.x)*f.y,f.x*f.y);
 var far=vec4f(0);
 for(var child=0u;child<4u;child++){var interpolated=vec4f(0);
 for(var corner=0u;corner<4u;corner++){
 let neighbour=clamp(base+vec2f(f32(corner%2u),f32(corner/2u)),vec2f(0),grid-1.);
 let coord=atlas_texel(neighbour,index*4.+f32(child),upperBlock);
 interpolated+=weights[corner]*upper[coord.y*atlas.x+coord.x];
 }far+=interpolated*.25;}
 near=vec4f(near.rgb+near.a*far.rgb,near.a*far.a);
 }output[id.y*atlas.x+id.x]=near;
}
