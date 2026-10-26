import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://ucobuymcipdnulhgjrvd.supabase.co";
export const SUPABASE_KEY = "sb_publishable_4K1NGXV1MR59vipXs8imdg_F5dNBd3s";
export const VAPID_PUBLIC = "BASqwe8UqPtq29-J9l3fpyRnfMRfbcvG5wDOdJmptdOrCGoRq_9pHRgKAVu08JIIwH2MCRDdblNW-gh-qO7Wn_Y";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "eshkol-auth" },
});

export const usernameToEmail = (u) => `${u.trim().toLowerCase()}@eshkol.app`;

export async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
