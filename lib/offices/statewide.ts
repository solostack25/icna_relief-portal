// "Statewide" offices (e.g. "Iowa Statewide", "Alabama - Statewide") are
// coverage areas, not physical locations, so they don't get an Office Dashboard.
export function isStatewideOffice(name: string | null | undefined): boolean {
  return /statewide/i.test(name ?? "");
}
