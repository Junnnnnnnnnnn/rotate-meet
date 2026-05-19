import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { monthDayKo, dowLong } from '@/lib/sessions';

// Always reflect operator changes (/date add / delete / activate) immediately —
// no caching, no redeploy needed.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('event_sessions')
    .select('id, event_date, venue, time_label')
    .eq('is_active', true)
    .order('event_date', { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const sessions = (data ?? []).map((s) => ({
    id: s.id as string,
    dateLabel: monthDayKo(s.event_date as string),
    dowLabel: dowLong(s.event_date as string),
    venue: s.venue as string,
    time: s.time_label as string,
  }));

  return NextResponse.json({ ok: true, sessions });
}
