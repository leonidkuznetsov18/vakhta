export interface ProfileZone {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
}

export function profileZone(input: {
  readonly openShift: { readonly zone: ProfileZone | null } | null;
  readonly nextShift: { readonly zone: ProfileZone | null } | null;
  readonly monthZones: readonly ProfileZone[];
}) {
  return {
    current: input.openShift ? input.openShift.zone : (input.nextShift?.zone ?? null),
    source: input.openShift
      ? ('CURRENT_SHIFT' as const)
      : input.nextShift
        ? ('NEXT_SHIFT' as const)
        : ('NOT_SCHEDULED' as const),
    monthZones: [...new Map(input.monthZones.map((zone) => [zone.id, zone])).values()],
  };
}
