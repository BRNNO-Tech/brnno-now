import { supabase } from './supabase';

export async function getUserRoles(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (error) return [];
  return (data ?? []).map((r) => r.role);
}

export async function hasRole(userId: string, role: string): Promise<boolean> {
  const roles = await getUserRoles(userId);
  return roles.includes(role);
}

export async function addRole(userId: string, role: string): Promise<void> {
  await supabase.from('user_roles').insert({ user_id: userId, role });
}
