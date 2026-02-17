import type { SupabaseClient } from '@supabase/supabase-js';

interface TagAPI {
  _id: string;
  name: string;
  color: string;
}

function rowToAPI(row: any): TagAPI {
  return { _id: row.id, name: row.name, color: row.color };
}

export async function getTags(supabase: SupabaseClient, userId: string): Promise<TagAPI[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('user_id', userId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data || []).map(rowToAPI);
}

export async function createTag(
  supabase: SupabaseClient,
  userId: string,
  data: { name: string; color: string },
): Promise<TagAPI> {
  const { data: tag, error } = await supabase
    .from('tags')
    .insert({ user_id: userId, name: data.name, color: data.color })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToAPI(tag);
}

export async function updateTag(
  supabase: SupabaseClient,
  userId: string,
  data: { _id: string; name?: string; color?: string },
): Promise<TagAPI> {
  const updateData: Record<string, string> = {};
  if (data.name) updateData.name = data.name;
  if (data.color) updateData.color = data.color;

  const { data: tag, error } = await supabase
    .from('tags')
    .update(updateData)
    .eq('id', data._id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToAPI(tag);
}

export async function deleteTag(
  supabase: SupabaseClient,
  userId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', tagId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}
