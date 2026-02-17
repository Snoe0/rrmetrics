import type { SupabaseClient } from '@supabase/supabase-js';

interface DailyNoteAPI {
  _id: string;
  date: string;
  content: string;
}

function rowToAPI(row: any): DailyNoteAPI {
  return { _id: row.id, date: row.date, content: row.content };
}

export async function getDailyNotes(
  supabase: SupabaseClient,
  userId: string,
): Promise<DailyNoteAPI[]> {
  const { data, error } = await supabase
    .from('daily_notes')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(rowToAPI);
}

export async function upsertDailyNote(
  supabase: SupabaseClient,
  userId: string,
  data: { date: string; content: string },
): Promise<DailyNoteAPI> {
  const { data: note, error } = await supabase
    .from('daily_notes')
    .upsert(
      { user_id: userId, date: data.date, content: data.content },
      { onConflict: 'user_id,date' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToAPI(note);
}

export async function deleteDailyNote(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<void> {
  const { error } = await supabase
    .from('daily_notes')
    .delete()
    .eq('user_id', userId)
    .eq('date', date);

  if (error) throw new Error(error.message);
}
