import { queryOptions } from '@tanstack/react-query';
import { rulesApi, rulesKey } from './rules-api';

export const checklistRulesQuery = (definitionId: string) =>
  queryOptions({
    queryKey: rulesKey(definitionId),
    queryFn: ({ signal }) => rulesApi.get(definitionId, signal),
  });
