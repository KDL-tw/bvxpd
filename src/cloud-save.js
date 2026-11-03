const SUPABASE_URL = 'https://vmwqewuqhfvynykrpjer.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rm3M3ETOt9BJ7StowWqriw_8zlKIRo1';
const DROP_TABLE = 'bullvixen_drop_snapshots';
const WORKSPACE = 'bullvixen-workspace-v1';

function client() {
  return globalThis.supabase?.createClient?.(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) || null;
}

const supabase = client();
export function cloudAvailable() { return Boolean(supabase); }
export async function cloudSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}
export async function requestCloudSignIn(email) {
  if (!supabase) throw new Error('Cloud saving is unavailable in this preview.');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: globalThis.location?.href || undefined } });
  if (error) throw error;
}
export async function cloudDropPayloads() {
  if (!supabase) return null;
  const session = await cloudSession();
  if (!session) return null;
  const { data, error } = await supabase.from(DROP_TABLE).select('drop_type,payload').eq('user_id', session.user.id).eq('election_id', WORKSPACE);
  if (error) throw error;
  return Object.fromEntries((data || []).map(row => [row.drop_type, row.payload]));
}
export async function saveCloudDrops(dropType, payload) {
  if (!supabase) return false;
  const session = await cloudSession();
  if (!session) return false;
  const { error } = await supabase.from(DROP_TABLE).upsert({ user_id: session.user.id, election_id: WORKSPACE, drop_type: dropType, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id,election_id,drop_type' });
  if (error) throw error;
  return true;
}
