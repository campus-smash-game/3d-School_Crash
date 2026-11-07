import type * as THREE from 'three';
import type { BreakableSpec } from './scene';

/** undefined는 초기화나 복원을 포함한 전체 갱신이다. 빈 집합은 변경 없음이다. */
export type VisualChanges = ReadonlySet<THREE.Mesh> | undefined;
type DamageView = { breakables: BreakableSpec[]; update: (player: THREE.Vector3) => void };

/** 위치에 따른 표시 전환이 없는 건물과 시설의 파괴 상태를 갱신한다. */
export function createDamageUpdates(views: readonly DamageView[]) {
  const owners = new Map<THREE.Mesh, Set<DamageView>>();
  for (const view of views) for (const { mesh } of view.breakables) {
    let list = owners.get(mesh);
    if (!list) owners.set(mesh, list = new Set());
    list.add(view);
  }
  let initialized = false;
  return {
    update(player: THREE.Vector3, changes?: VisualChanges) {
      if (!initialized || changes === undefined) {
        for (const view of views) view.update(player);
        initialized = true;
        return;
      }
      const dirty = new Set<DamageView>();
      for (const mesh of changes) for (const view of owners.get(mesh) ?? []) dirty.add(view);
      for (const view of dirty) view.update(player);
    },
  };
}
