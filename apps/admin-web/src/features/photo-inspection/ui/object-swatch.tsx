import { objectColor } from '../model/object-colors';

/** The small color mark that ties a region card, a chip or a rule to its boxes on the photo. */
export function ObjectSwatch({
  objectId,
  objectName,
  rules = [],
}: {
  objectId: string | null | undefined;
  objectName?: string | undefined;
  rules?: readonly { objectId: string }[];
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 rounded-sm border border-black/30"
      style={{ backgroundColor: objectColor(objectId, objectName, rules) }}
    />
  );
}
