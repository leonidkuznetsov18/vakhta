import type { EmployeeView, OverviewPerson } from '@vakhta/contracts';
import type { StackedPerson } from '@/components/app/avatar-stack';
import { avatarUrl } from '@/entities/employee';

/** Employee photos by id; a person missing from the roster keeps the initials placeholder. */
export type Faces = ReadonlyMap<string, string | null>;

export function facesOf(employees: readonly Pick<EmployeeView, 'id' | 'avatarVersion'>[]): Faces {
  return new Map(employees.map((e) => [e.id, avatarUrl(e.id, e.avatarVersion)]));
}

/** Snapshot people as avatar-stack entries; `note` adds a line such as the zone to the name. */
export function stacked(
  people: readonly OverviewPerson[],
  faces: Faces,
  note: (person: OverviewPerson) => string | null = () => null,
): StackedPerson[] {
  return people.map((p) => ({
    id: p.employeeId,
    name: p.fullName,
    seed: p.employeeId,
    image: faces.get(p.employeeId) ?? null,
    note: note(p),
  }));
}

/** Adds photos to stacks built elsewhere; entries that are not employees stay as they are. */
export function withFaces(people: readonly StackedPerson[], faces: Faces): StackedPerson[] {
  return people.map((p) => ({ ...p, image: p.image ?? faces.get(p.id) ?? null }));
}
