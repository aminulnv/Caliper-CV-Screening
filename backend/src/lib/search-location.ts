/** Sentinel for worldwide search (no location filter). */
export const GLOBAL_SEARCH = 'global';

export class NeedsCountryError extends Error {
  readonly needsCountry = true;

  constructor() {
    super('No location found in the job description. Select a country or Global to continue.');
    this.name = 'NeedsCountryError';
  }
}

export function isGlobalSearch(value: string | undefined | null): boolean {
  return !value?.trim() || value.trim().toLowerCase() === GLOBAL_SEARCH;
}

export function applySearchCountry(
  resolvedLocation: string | undefined,
  searchCountry: string | undefined,
): string | undefined {
  if (resolvedLocation?.trim()) return resolvedLocation.trim();
  if (!searchCountry?.trim()) return undefined;
  if (isGlobalSearch(searchCountry)) return undefined;
  return searchCountry.trim();
}

export function locationScopeLabel(locationQuery: string | undefined, searchCountry?: string): string | null {
  if (locationQuery?.trim()) return locationQuery.trim();
  if (searchCountry && !isGlobalSearch(searchCountry)) return searchCountry.trim();
  if (searchCountry && isGlobalSearch(searchCountry)) return 'Global (worldwide)';
  return null;
}
