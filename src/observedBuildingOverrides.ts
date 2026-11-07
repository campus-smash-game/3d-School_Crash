/** 원본 윤곽은 보존하고 현재 사진과 충돌하는 추정 지상 체적만 제외한다. */
export const OBSERVED_BUILDING_OVERRIDES = {
  'way/455025059': {
    disposition: 'observed-ground-only',
    review: 'sources/living-science-adjacent-roadview-review.json',
    observedAt: '2026-08',
    estimatedVolume: { height: 14, levels: 4 },
    identityConfirmed: false,
  },
} as const;

export function shouldRenderMappedBuilding(building: { id?: string }): boolean {
  return !building.id || !Object.hasOwn(OBSERVED_BUILDING_OVERRIDES, building.id);
}
