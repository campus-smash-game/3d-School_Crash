import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeCampusSupplements} from './merge-campus-supplements.mjs';

// 과거 자료의 모든 행을 보존하고, 검토된 별도 건물만 추가할 수 있다.
export function assertCampusSourcePreserved(file,currentBytes,historicalBytes){
 if(file!=='public/data/campus.json'){assert.deepEqual(currentBytes,historicalBytes,file+' changed');return;}
 const current=JSON.parse(currentBytes),historical=JSON.parse(historicalBytes),manifest=JSON.parse(readFileSync(new URL('../sources/campus-supplemental-buildings.json',import.meta.url)));
 const expected=mergeCampusSupplements(historical,manifest);
 assert.deepEqual(current,expected,'Campus changed beyond the reviewed supplemental manifest');
}

// 이전 구역의 기하 비교는 당시 존재하던 건물 행으로 실행한다. 새 보완 건물은 전용 현재 버전 검사에서 검증한다.
export function campusAtHistoricalFootprints(data,historicalBytes){const ids=new Set(JSON.parse(historicalBytes).buildings.map(b=>b.id));return {...data,buildings:data.buildings.filter(b=>ids.has(b.id))};}
