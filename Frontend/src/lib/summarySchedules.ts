// Daily summary schedules a person set up for the Summarizer.

export interface SummarySchedule {
  id: number;
  channel_id: number;
  community_id: number;
  channel_name: string | null;
  community_name: string | null;
  /** "21:00" or "21:00:00". */
  schedule_time: string;
  timezone: string;
  is_active: boolean;
  last_triggered_at: string | null;
}

/** "21:00:00" becomes "21:00", so it fits a time input and reads the same everywhere. */
export function shortTime(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

export const isValidTime = (time: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

/** "Every day at 21:00 (Asia/Karachi) in #general". */
export function describeSchedule(s: Pick<SummarySchedule, 'schedule_time' | 'timezone' | 'channel_name' | 'channel_id'>): string {
  return `Every day at ${shortTime(s.schedule_time)} (${s.timezone || 'UTC'}) in #${s.channel_name ?? s.channel_id}`;
}

/** Why a new schedule cannot be saved yet, or null. */
export function scheduleProblem(input: { channelId: number | ''; time: string }, existing: SummarySchedule[]): string | null {
  if (input.channelId === '') return 'Pick a channel.';
  if (!isValidTime(input.time)) return 'Pick a time.';
  if (existing.some((s) => s.channel_id === input.channelId && shortTime(s.schedule_time) === input.time)) {
    return 'You already have a summary for this channel at that time.';
  }
  return null;
}
