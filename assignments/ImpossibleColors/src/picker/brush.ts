type Point=readonly [number,number];

/** Compact oversampled paths by image-space arc length while retaining both ends. */
export function appendBrushPoint(points:readonly Point[],point:Point,size={width:1,height:1}):readonly Point[] {
  const last=points.at(-1);
  if(last&&last[0]===point[0]&&last[1]===point[1])return points;
  if(points.length<1024)return [...points,point];
  const distances=[0];
  for(let i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot((points[i][0]-points[i-1][0])*size.width,(points[i][1]-points[i-1][1])*size.height));
  const length=distances.at(-1)!;
  if(length===0)return [points[0],point];
  const compact:Point[]=[points[0]];let segment=1;
  for(let i=1;i<511;i++){
    const target=length*i/511;
    while(segment<points.length-1&&distances[segment]<target)segment++;
    const start=points[segment-1],end=points[segment],span=distances[segment]-distances[segment-1];
    const t=span?(target-distances[segment-1])/span:0;
    compact.push([start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t]);
  }
  compact.push(points.at(-1)!,point);return compact;
}
