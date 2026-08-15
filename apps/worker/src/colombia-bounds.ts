// Generous bounding box for Colombia (mainland + San Andrés y Providencia + Amazonas),
// used to drop points from diaspora/regional feeds that fall outside the country —
// this platform's public map is scoped to Colombia only.
export function isWithinColombia(lat: number, lng: number): boolean {
  if (lat < -5 || lat > 13.5 || lng < -82 || lng > -66) return false;
  // The plain box above still admits northern Venezuela (e.g. Caracas ≈ 10.5,-66.9): Colombia's
  // own northeastern border (La Guajira / Norte de Santander / Arauca) doesn't reach past
  // roughly -71.5°W once latitude climbs above 8°N, so exclude that wedge explicitly.
  if (lat > 8 && lng > -71.5) return false;
  return true;
}
