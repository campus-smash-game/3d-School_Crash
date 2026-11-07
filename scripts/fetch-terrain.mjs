import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';

const origin={lat:37.4663683,lon:126.948395075};
const metersLon=111320*Math.cos(origin.lat*Math.PI/180);
const bounds={minX:-700,maxX:2300,minZ:-3100,maxZ:850};
const width=151,height=199,zoom=13;
await mkdir('artifacts/terrain',{recursive:true});
await mkdir('public/data',{recursive:true});
const tiles=new Map();
function mercator(lat,lon){return [(lon+180)/360*2**zoom,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**zoom];}
const northWest=mercator(origin.lat+bounds.maxZ/111320,origin.lon+bounds.minX/metersLon);
const southEast=mercator(origin.lat+bounds.minZ/111320,origin.lon+bounds.maxX/metersLon);
for(let x=Math.floor(northWest[0]);x<=Math.floor(southEast[0]);x++)for(let y=Math.floor(northWest[1]);y<=Math.floor(southEast[1]);y++){
  const name=`${zoom}-${x}-${y}`,path=`artifacts/terrain/${name}.png`;
  let bytes;
  try{bytes=await readFile(path);}catch{
    const url=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
    const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error(`Terrain download: ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());await writeFile(path,bytes);
  }
  tiles.set(`${x},${y}`,PNG.sync.read(bytes));
  console.log(`Terrain tile ${name}`);
}
function elevation(lat,lon){
  const [tx,ty]=mercator(lat,lon),x=Math.floor(tx),y=Math.floor(ty),image=tiles.get(`${x},${y}`);
  const px=(tx-x)*256,py=(ty-y)*256;
  const sample=(a,b)=>{const i=(Math.max(0,Math.min(255,b))*256+Math.max(0,Math.min(255,a)))*4;return image.data[i]*256+image.data[i+1]+image.data[i+2]/256-32768;};
  const ix=Math.floor(px),iy=Math.floor(py),u=px-ix,v=py-iy;
  return (sample(ix,iy)*(1-u)+sample(ix+1,iy)*u)*(1-v)+(sample(ix,iy+1)*(1-u)+sample(ix+1,iy+1)*u)*v;
}
const base=elevation(origin.lat,origin.lon),heights=[];
for(let row=0;row<height;row++)for(let col=0;col<width;col++){
  const x=bounds.minX+(bounds.maxX-bounds.minX)*col/(width-1);
  const z=bounds.minZ+(bounds.maxZ-bounds.minZ)*row/(height-1);
  heights.push(Math.round((elevation(origin.lat+z/111320,origin.lon+x/metersLon)-base)*100)/100);
}
await writeFile('public/data/terrain.json',JSON.stringify({origin,bounds,width,height,baseElevation:base,heights,source:'Mapzen Terrain Tiles, global SRTM/GMTED2010 courtesy of USGS',sourceUrl:'https://registry.opendata.aws/terrain-tiles/',attributionUrl:'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',retrieved:new Date().toISOString(),notes:'Relative elevation sampled from global DEM. Game terrain smooths plaza and building pads; not a site survey.'}));
console.log(JSON.stringify({width,height,base,min:Math.min(...heights),max:Math.max(...heights)}));
