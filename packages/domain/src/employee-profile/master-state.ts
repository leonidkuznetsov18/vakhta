export function unitMasterState(input: {
  readonly masterId: string | null;
  readonly masterStatus: string | null;
  readonly masterGrantCoversUnit: boolean;
  readonly employeeId: string;
}) {
  return {
    state: !input.masterId
      ? ('MISSING' as const)
      : input.masterStatus !== 'ACTIVE'
        ? ('INACTIVE' as const)
        : !input.masterGrantCoversUnit
          ? ('NO_PANEL_ACCESS' as const)
          : ('ASSIGNED' as const),
    isSelf: input.masterId !== null && input.masterId === input.employeeId,
  };
}
