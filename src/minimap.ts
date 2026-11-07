import type {Traffic} from './traffic';
import {shouldRenderMappedBuilding} from './observedBuildingOverrides';

type Point=[number,number];
export class Minimap{
  private ctx:CanvasRenderingContext2D;
  private background=document.createElement('canvas');
  private bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
  constructor(private canvas:HTMLCanvasElement,data:{bounds:{minX:number;maxX:number;minZ:number;maxZ:number};buildings:{id?:string;points:Point[];kind?:string}[];roads:{points:Point[];width:number}[]}){
    this.ctx=canvas.getContext('2d')!;this.background.width=768;this.background.height=1536;this.bounds=data.bounds;
    const c=this.background.getContext('2d')!;c.fillStyle='#cbd8c2';c.fillRect(0,0,768,1536);
    const project=([x,z]:Point)=>[(x-this.bounds.minX)/(this.bounds.maxX-this.bounds.minX)*768,(this.bounds.maxZ-z)/(this.bounds.maxZ-this.bounds.minZ)*1536];
    for(const road of data.roads){c.beginPath();road.points.forEach((p,i)=>{const[x,y]=project(p);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.strokeStyle=road.width>4?'#f5f3e7':'#dfe6d5';c.lineWidth=Math.max(1,road.width*.5);c.stroke();}
    c.fillStyle='#899c9c';c.strokeStyle='#708a8d';c.lineWidth=.7;
    for(const b of data.buildings.filter(shouldRenderMappedBuilding)){c.fillStyle=b.kind==='construction'?'#9b917c':'#899c9c';c.strokeStyle=b.kind==='construction'?'#756c5b':'#708a8d';c.beginPath();b.points.forEach((p,i)=>{const[x,y]=project(p);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.closePath();c.fill();c.stroke();}
  }
  update(x:number,z:number,bearing:number,traffic:Traffic){
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height,range=240;
    c.fillStyle='#cbd8c2';c.fillRect(0,0,w,h);
    const sx=(x-range/2-this.bounds.minX)/(this.bounds.maxX-this.bounds.minX)*768,sy=(this.bounds.maxZ-z-range/2)/(this.bounds.maxZ-this.bounds.minZ)*1536;
    c.drawImage(this.background,sx,sy,range/(this.bounds.maxX-this.bounds.minX)*768,range/(this.bounds.maxZ-this.bounds.minZ)*1536,0,0,w,h);
    for(const v of traffic.minimapPositions()){const px=w/2+(v.x-x)/range*w,py=h/2-(v.z-z)/range*h;if(px<0||py<0||px>w||py>h)continue;c.fillStyle=v.kind==='bus'?'#369568':'#db9b40';c.fillRect(px-3,py-3,6,6);}
    c.save();c.translate(w/2,h/2);c.rotate(bearing);c.fillStyle='#2163bd';c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.moveTo(0,-11);c.lineTo(7,8);c.lineTo(0,4);c.lineTo(-7,8);c.closePath();c.fill();c.stroke();c.restore();
  }
}
