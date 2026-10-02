// Campus Coordinates System & Geodesic Calculation Engine for AICSSYC Treasure Hunt
// Campus: SRM Institute of Science and Technology, Kattankulathur (KTR)

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface NodeCoordinateMeta extends GeoPoint {
  id: number;
  name: string;
  area: string;
  routeId: 1 | 2;
  stage: number;
}

// SRM Kattankulathur Central Coordinate
export const CAMPUS_CENTER: GeoPoint = {
  lat: 12.823610,
  lng: 80.044200,
};

// Default high-precision coordinates for all 24 Checkpoint Nodes
export const CAMPUS_DEFAULT_COORDINATES: Record<number, NodeCoordinateMeta> = {
  // ROUTE 1: Hippocrates Loop (Nodes 01 - 12)
  1: {
    id: 1,
    routeId: 1,
    stage: 1,
    name: 'Hippocrates Hall',
    area: 'Medical Complex - Hippocrates Concourse',
    lat: 12.820845,
    lng: 80.038512,
  },
  2: {
    id: 2,
    routeId: 1,
    stage: 2,
    name: 'N Block',
    area: 'Academic Quad - N-Block Ground Arcade',
    lat: 12.823610,
    lng: 80.042530,
  },
  3: {
    id: 3,
    routeId: 1,
    stage: 3,
    name: 'Shiva Temple',
    area: 'Campus Sanctuary - Shiva Temple Grounds',
    lat: 12.821520,
    lng: 80.040210,
  },
  4: {
    id: 4,
    routeId: 1,
    stage: 4,
    name: 'BEL Block',
    area: 'Technology Sector - BEL Block Entrance Foyer',
    lat: 12.824230,
    lng: 80.043040,
  },
  5: {
    id: 5,
    routeId: 1,
    stage: 5,
    name: 'TP Building',
    area: 'Tech Park Zone - TP Building Ground Podium',
    lat: 12.824850,
    lng: 80.045620,
  },
  6: {
    id: 6,
    routeId: 1,
    stage: 6,
    name: 'Clock Tower',
    area: 'Campus Heart - Heritage Clock Tower Plaza',
    lat: 12.823210,
    lng: 80.042850,
  },
  7: {
    id: 7,
    routeId: 1,
    stage: 7,
    name: 'UB Building',
    area: 'University Building - Ground Floor Concourse',
    lat: 12.823540,
    lng: 80.045010,
  },
  8: {
    id: 8,
    routeId: 1,
    stage: 8,
    name: 'Architecture Block',
    area: 'School of Architecture - Design Portico',
    lat: 12.825220,
    lng: 80.046530,
  },
  9: {
    id: 9,
    routeId: 1,
    stage: 9,
    name: 'Law College',
    area: 'School of Law - Academic Portal',
    lat: 12.825810,
    lng: 80.048020,
  },
  10: {
    id: 10,
    routeId: 1,
    stage: 10,
    name: 'Vendhar',
    area: 'Vendhar Square - Central Promenade',
    lat: 12.823050,
    lng: 80.043210,
  },
  11: {
    id: 11,
    routeId: 1,
    stage: 11,
    name: 'Medical College',
    area: 'Health Sciences - SRM Medical College Quad',
    lat: 12.821210,
    lng: 80.038840,
  },
  12: {
    id: 12,
    routeId: 1,
    stage: 12,
    name: 'Hippocrates Hall',
    area: 'Grand Finale - Hippocrates Hall Apex Podium',
    lat: 12.820845,
    lng: 80.038512,
  },

  // ROUTE 2: Hospital to Arts Loop (Nodes 13 - 24)
  13: {
    id: 13,
    routeId: 2,
    stage: 1,
    name: 'SRM General Hospital Lawn & Entrance',
    area: 'Hospital Frontage - Emergency Lawn & Gateway',
    lat: 12.819820,
    lng: 80.037810,
  },
  14: {
    id: 14,
    routeId: 2,
    stage: 2,
    name: 'Dental / Pharmacy Block',
    area: 'Health Sciences - Dental & Pharmacy Arcade',
    lat: 12.820240,
    lng: 80.039020,
  },
  15: {
    id: 15,
    routeId: 2,
    stage: 3,
    name: 'Bio-Tech Block & Life Sciences Lawn',
    area: 'Bio-Sciences Sector - Life Sciences Lawn & Pod',
    lat: 12.821030,
    lng: 80.041050,
  },
  16: {
    id: 16,
    routeId: 2,
    stage: 4,
    name: 'Dr. T.P. Ganesan Auditorium',
    area: 'Grand Convention - Auditorium Portico',
    lat: 12.822040,
    lng: 80.044020,
  },
  17: {
    id: 17,
    routeId: 2,
    stage: 5,
    name: 'Vendhar Square & Clock Tower Area',
    area: 'Central Junction - Vendhar Square & Clock Tower',
    lat: 12.823210,
    lng: 80.042850,
  },
  18: {
    id: 18,
    routeId: 2,
    stage: 6,
    name: 'BEL Block',
    area: 'Engineering Wing - BEL Block East Gateway',
    lat: 12.824230,
    lng: 80.043040,
  },
  19: {
    id: 19,
    routeId: 2,
    stage: 7,
    name: 'Java Green / Main Canteen',
    area: 'Food Court Plaza - Java Green & Main Canteen',
    lat: 12.823920,
    lng: 80.043510,
  },
  20: {
    id: 20,
    routeId: 2,
    stage: 8,
    name: 'SRM Tech Park',
    area: 'IT Sector - SRM Tech Park Main Atrium',
    lat: 12.824850,
    lng: 80.045620,
  },
  21: {
    id: 21,
    routeId: 2,
    stage: 9,
    name: 'Central Library / University Building (UB)',
    area: 'Knowledge Core - Central Library & UB Concourse',
    lat: 12.823540,
    lng: 80.045010,
  },
  22: {
    id: 22,
    routeId: 2,
    stage: 10,
    name: 'Post Office & Bank Complex',
    area: 'Campus Services - Post Office & Banking Arcade',
    lat: 12.824050,
    lng: 80.045830,
  },
  23: {
    id: 23,
    routeId: 2,
    stage: 11,
    name: 'School of Law',
    area: 'Juridical Wing - School of Law Forecourt',
    lat: 12.825810,
    lng: 80.048020,
  },
  24: {
    id: 24,
    routeId: 2,
    stage: 12,
    name: 'Faculty of Science & Humanities (Arts College)',
    area: 'Arts & Humanities - FSH Main Entrance Portico',
    lat: 12.826220,
    lng: 80.047030,
  },
};

/**
 * Returns the resolved coordinates for a checkpoint, falling back to campus defaults
 */
export function getCheckpointCoordinates(checkpoint: {
  id: number;
  latitude?: number | null;
  longitude?: number | null;
}): GeoPoint {
  if (
    checkpoint.latitude != null &&
    !isNaN(Number(checkpoint.latitude)) &&
    checkpoint.longitude != null &&
    !isNaN(Number(checkpoint.longitude))
  ) {
    return {
      lat: Number(checkpoint.latitude),
      lng: Number(checkpoint.longitude),
    };
  }

  const fallback = CAMPUS_DEFAULT_COORDINATES[checkpoint.id];
  if (fallback) {
    return { lat: fallback.lat, lng: fallback.lng };
  }

  return CAMPUS_CENTER;
}

/**
 * Calculates Great-Circle distance in meters between two coordinates via Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Calculates azimuth bearing from point A to point B in degrees (0 to 360)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * Human-readable distance formatter (e.g. "45 m", "1.2 km")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * SQL Snippet Generator for copying into Supabase SQL Editor
 */
export function generateSqlMigrationSnippet(): string {
  return `-- ==============================================================================
-- AICSSYC TREASURE HUNT - OPENSTREETMAP COORDINATES MIGRATION
-- Run this script in the Supabase SQL Editor for BOTH Route 1 and Route 2 databases
-- ==============================================================================

-- 1. Ensure latitude and longitude columns exist on public.checkpoints
ALTER TABLE public.checkpoints 
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 2. Populate exact coordinates for Route 1 Checkpoints (Nodes 01 - 12)
UPDATE public.checkpoints SET latitude = 12.820845, longitude = 80.038512 WHERE id = 1;  -- Hippocrates Hall
UPDATE public.checkpoints SET latitude = 12.823610, longitude = 80.042530 WHERE id = 2;  -- N Block
UPDATE public.checkpoints SET latitude = 12.821520, longitude = 80.040210 WHERE id = 3;  -- Shiva Temple
UPDATE public.checkpoints SET latitude = 12.824230, longitude = 80.043040 WHERE id = 4;  -- BEL Block
UPDATE public.checkpoints SET latitude = 12.824850, longitude = 80.045620 WHERE id = 5;  -- TP Building
UPDATE public.checkpoints SET latitude = 12.823210, longitude = 80.042850 WHERE id = 6;  -- Clock Tower
UPDATE public.checkpoints SET latitude = 12.823540, longitude = 80.045010 WHERE id = 7;  -- UB Building
UPDATE public.checkpoints SET latitude = 12.825220, longitude = 80.046530 WHERE id = 8;  -- Architecture Block
UPDATE public.checkpoints SET latitude = 12.825810, longitude = 80.048020 WHERE id = 9;  -- Law College
UPDATE public.checkpoints SET latitude = 12.823050, longitude = 80.043210 WHERE id = 10; -- Vendhar
UPDATE public.checkpoints SET latitude = 12.821210, longitude = 80.038840 WHERE id = 11; -- Medical College
UPDATE public.checkpoints SET latitude = 12.820845, longitude = 80.038512 WHERE id = 12; -- Hippocrates Hall (Final)

-- 3. Populate exact coordinates for Route 2 Checkpoints (Nodes 13 - 24)
UPDATE public.checkpoints SET latitude = 12.819820, longitude = 80.037810 WHERE id = 13; -- SRM General Hospital
UPDATE public.checkpoints SET latitude = 12.820240, longitude = 80.039020 WHERE id = 14; -- Dental / Pharmacy Block
UPDATE public.checkpoints SET latitude = 12.821030, longitude = 80.041050 WHERE id = 15; -- Bio-Tech Block
UPDATE public.checkpoints SET latitude = 12.822040, longitude = 80.044020 WHERE id = 16; -- Dr. T.P. Ganesan Auditorium
UPDATE public.checkpoints SET latitude = 12.823210, longitude = 80.042850 WHERE id = 17; -- Vendhar Square & Clock Tower
UPDATE public.checkpoints SET latitude = 12.824230, longitude = 80.043040 WHERE id = 18; -- BEL Block
UPDATE public.checkpoints SET latitude = 12.823920, longitude = 80.043510 WHERE id = 19; -- Java Green / Main Canteen
UPDATE public.checkpoints SET latitude = 12.824850, longitude = 80.045620 WHERE id = 20; -- SRM Tech Park
UPDATE public.checkpoints SET latitude = 12.823540, longitude = 80.045010 WHERE id = 21; -- Central Library / UB
UPDATE public.checkpoints SET latitude = 12.824050, longitude = 80.045830 WHERE id = 22; -- Post Office & Bank Complex
UPDATE public.checkpoints SET latitude = 12.825810, longitude = 80.048020 WHERE id = 23; -- School of Law
UPDATE public.checkpoints SET latitude = 12.826220, longitude = 80.047030 WHERE id = 24; -- FSH (Arts College)
`;
}
