import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SavePatternCommand } from '@vakhta/contracts';
import { patternsApi } from '../api/patterns-api';
import { scheduleKeys } from './ownership';

export const patternsKey = (access: string, siteId: string) =>
  [...scheduleKeys.all(access), 'patterns', siteId] as const;

/** Saved batch inputs of the site; saving or removing refreshes the same list. */
export function usePatterns(input: {
  readonly accessKey: string;
  readonly siteId: string;
  readonly enabled: boolean;
}) {
  const client = useQueryClient();
  const key = patternsKey(input.accessKey, input.siteId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => patternsApi.list(input.siteId, signal),
    enabled: input.enabled && !!input.siteId,
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const save = useMutation({
    mutationFn: (command: SavePatternCommand) => patternsApi.save(command),
    retry: false,
    networkMode: 'always',
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => patternsApi.remove(id),
    retry: false,
    networkMode: 'always',
    onSuccess: refresh,
  });
  return { query, patterns: query.data ?? [], save, remove };
}
