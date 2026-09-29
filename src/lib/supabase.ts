import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ==============================================================================
// AICSSYC TREASURE HUNT - DUAL DATABASE SUPABASE CLIENT MANAGER
// Horizontal Scaling for Egress Limit Mitigation (5GB Free Tier Threshold)
// Route 1 Database: Checkpoints 01..12 & Route 1 Cohort Teams
// Route 2 Database: Checkpoints 13..24 & Route 2 Cohort Teams
// ==============================================================================

// ROUTE 1 CONFIGURATION (Primary / Existing Supabase Project)
const route1Url =
  process.env.SUPABASE_ROUTE_1_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_ROUTE_1_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const route1AnonKey =
  process.env.SUPABASE_ROUTE_1_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ROUTE_1_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const route1ServiceRoleKey =
  process.env.SUPABASE_ROUTE_1_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

// ROUTE 2 CONFIGURATION (Secondary / New Supabase Project for Route 2)
const route2Url =
  process.env.SUPABASE_ROUTE_2_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_ROUTE_2_URL ||
  '';

const route2AnonKey =
  process.env.SUPABASE_ROUTE_2_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ROUTE_2_ANON_KEY ||
  '';

const route2ServiceRoleKey =
  process.env.SUPABASE_ROUTE_2_SERVICE_ROLE_KEY ||
  '';

// Check if Route 2 database has dedicated credentials configured
export const isRoute2Configured = (): boolean => {
  return Boolean(route2Url && (route2ServiceRoleKey || route2AnonKey));
};

// Singleton Client Cache (Prevents socket leaks and minimizes connection egress)
let adminClientR1: SupabaseClient | null = null;
let adminClientR2: SupabaseClient | null = null;
let publicClientR1: SupabaseClient | null = null;
let publicClientR2: SupabaseClient | null = null;

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

/**
 * Returns privileged server-side Supabase admin client for a given route.
 * @param route Optional 1 | 2. Defaults to 1.
 * If route 2 is requested but not yet configured, gracefully falls back to route 1.
 */
export const getSupabaseAdmin = (route: 1 | 2 = 1): SupabaseClient | null => {
  if (route === 2) {
    if (route2Url && route2ServiceRoleKey) {
      if (!adminClientR2) {
        adminClientR2 = createClient(route2Url, route2ServiceRoleKey, clientOptions);
      }
      return adminClientR2;
    }
    // Fallback to DB 1 if DB 2 is not yet configured in environment
    return getSupabaseAdmin(1);
  }

  // Route 1 (Default)
  if (!route1Url || !route1ServiceRoleKey) {
    return null;
  }
  if (!adminClientR1) {
    adminClientR1 = createClient(route1Url, route1ServiceRoleKey, clientOptions);
  }
  return adminClientR1;
};

/**
 * Explicit helper for route-specific admin client.
 */
export const getSupabaseRouteAdmin = (route: 1 | 2): SupabaseClient | null => {
  return getSupabaseAdmin(route);
};

/**
 * Returns admin instances for both Route 1 and Route 2 databases.
 * Useful for operations that aggregate data across both routes (e.g., leaderboard,
 * admin teams list, team login lookups).
 */
export const getBothSupabaseAdmins = (): {
  db1: SupabaseClient | null;
  db2: SupabaseClient | null;
  isMultiDb: boolean;
} => {
  const db1 = getSupabaseAdmin(1);
  const isMulti = isRoute2Configured();
  const db2 = isMulti ? getSupabaseAdmin(2) : db1;

  return {
    db1,
    db2,
    isMultiDb: isMulti && db2 !== db1,
  };
};

/**
 * Browser/Client-safe Supabase instance (uses anon public key).
 */
export const getSupabaseClient = (route: 1 | 2 = 1): SupabaseClient | null => {
  if (route === 2 && route2Url && route2AnonKey) {
    if (!publicClientR2) {
      publicClientR2 = createClient(route2Url, route2AnonKey);
    }
    return publicClientR2;
  }

  if (!route1Url || !route1AnonKey) {
    return null;
  }
  if (!publicClientR1) {
    publicClientR1 = createClient(route1Url, route1AnonKey);
  }
  return publicClientR1;
};
