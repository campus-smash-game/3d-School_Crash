type Point = { x: number; z: number };
type Slab = (polygon: Point[], heights: number[], thickness: number, color: number, name: string, extra?: Record<string, unknown>) => void;

/** 2026년 리모델링 사진과 1층 평면도의 휴게데크, 계단식 스탠드. 치수는 지도에 맞춘 근사다. */
export function addHealthCourtyard(slab: Slab, ground: (u: number, v: number) => number, entryFloor: number, northFloor: number) {
  const paving = 0x99735e, stone = 0xaaa89d;
  const rect = (u0: number, u1: number, v0: number, v1: number, y: number, name: string, paved = true, thickness = .22) => {
    const polygon = [{x:u0,z:v0},{x:u1,z:v0},{x:u1,z:v1},{x:u0,z:v1}];
    const bottom=Math.min(...[u0,u1,(u0+u1)/2].flatMap(u=>[v0,v1,(v0+v1)/2].map(v=>ground(u,v))))-.12;
    slab(polygon, polygon.map(() => y), paved?Math.max(thickness,y-bottom):thickness, paved ? paving : stone, name, {paving:paved,courtyard:true});
  };
  // 포장의 돌 받침을 지형 아래까지 내려 중복 벽이나 공중에 뜬 가장자리를 만들지 않는다.
  const filledSeat = (u0:number,u1:number,v0:number,v1:number,y:number,name:string) => {
    const bottom=Math.min(...[u0,u1].flatMap(u=>[v0,v1].map(v=>ground(u,v))))-.12;
    rect(u0,u1,v0,v1,y,name,false,Math.max(.24,y-bottom));
  };
  for(let v=31;v<58.5;v+=2.5){
    const end=Math.min(58.5,v+2.5);
    rect(-3.3,.5,v,end,entryFloor+.008,'health-west-brick-paving');
  }
  for(let u=1;u<20.6;u+=3.92)for(let v=58.5;v<65.5;v+=3.5)
    rect(u,Math.min(20.6,u+3.92),v,Math.min(65.5,v+3.5),northFloor,'health-north-rest-deck');
  const count=Math.max(1,Math.ceil((northFloor-entryFloor)/.24));
  for(let i=0;i<count;i++)rect(-1+2*i/count,-1+2*(i+1)/count,58.5,61,entryFloor+(northFloor-entryFloor)*(i+1)/count,'health-north-deck-entry-step');
  // 도면의 뒤편 스탠드는 기존 경사에 놓인다. 좌석 단과 낮은 보행 계단을 구분한다.
  let rearFloor=-Infinity;
  for(let u=20.7;u<=23;u+=.25)for(let v=36.5;v<=55;v+=.25)rearFloor=Math.max(rearFloor,ground(u,v)+.12);
  for(let v=36.5;v<55;v+=3.7)rect(20.7,23.1,v,Math.min(55,v+3.7),rearFloor,'health-rear-brick-walk');
  const tiers=[];
  for(let row=0;row<3;row++){
    const u0=23.1+row*.85,u1=u0+.85,y=rearFloor+(row+1)*.36;
    for(let v=37.5;v<51.5;v+=3.5)filledSeat(u0,u1,v,Math.min(51.5,v+3.5),y,'health-rear-seat-tier');
    tiers.push({u0,u1,v0:37.5,v1:51.5,y});
  }
  for(let i=0;i<6;i++)filledSeat(23.1+i*.425,23.1+(i+1)*.425,51.5,53.1,rearFloor+(i+1)*.18,'health-rear-seat-access-step');
  // 뒤편 보도와 북쪽 데크 사이의 높이는 두 끝을 잇는 완만한 포장으로 연결한다.
  for(let v=55;v<64;v+=1.5){
    const end=Math.min(64,v+1.5),y0=rearFloor+(northFloor-rearFloor)*(v-55)/9,y1=rearFloor+(northFloor-rearFloor)*(end-55)/9;
    const p=[{x:20.7,z:v},{x:23.1,z:v},{x:23.1,z:end},{x:20.7,z:end}];
    const thickness=Math.max(.24,Math.max(y0,y1)-Math.min(...p.map(q=>ground(q.x,q.z)))+.12);
    slab(p,[y0,y0,y1,y1],thickness,paving,'health-rear-north-link',{paving:true,courtyard:true});
  }
  rect(20.6,23.1,64,65.5,northFloor,'health-north-deck-rear-link');
  return {source:'https://kiramonthly.com/2623',planLabels:{northDeck:8,rearStand:7},northDeck:{u0:1,u1:20.6,v0:58.5,v1:65.5,floor:northFloor},rearWalk:{u0:20.7,u1:23.1,v0:36.5,v1:55,floor:rearFloor},tiers,accessSteps:6,seatRise:.36,walkRise:.18,brickSize:[.24,.12],estimated:true,terrainPreserved:true};
}
