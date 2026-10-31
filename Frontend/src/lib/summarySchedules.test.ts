import { describe, expect, it } from 'vitest';
import { describeSchedule, isValidTime, scheduleProblem, shortTime, type SummarySchedule } from './summarySchedules';

const one = (over: Partial<SummarySchedule> = {}): SummarySchedule => ({
  id: 1, channel_id: 5, community_id: 2, channel_name: 'general', community_name: 'CS', schedule_time: '21:00:00',
  timezone: 'Asia/Karachi', is_active: true, last_triggered_at: null, ...over,
});

describe('shortTime', () => {
  it('drops the seconds and pads the hour', () => {
    expect(shortTime('21:00:00')).toBe('21:00');
    expect(shortTime('9:05')).toBe('09:05');
    expect(shortTime(null)).toBe('');
    expect(shortTime('soon')).toBe('');
  });
});

describe('isValidTime', () => {
  it('accepts 24-hour times only', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    for (const bad of ['24:00', '9:00', '12:60', '', '9pm']) expect(isValidTime(bad)).toBe(false);
  });
});

describe('describeSchedule', () => {
  it('reads as a sentence, falling back to the channel id and UTC', () => {
    expect(describeSchedule(one())).toBe('Every day at 21:00 (Asia/Karachi) in #general');
    expect(describeSchedule(one({ channel_name: null, timezone: '' }))).toBe('Every day at 21:00 (UTC) in #5');
  });
});

describe('scheduleProblem', () => {
  it('needs a channel and a time', () => {
    expect(scheduleProblem({ channelId: '', time: '21:00' }, [])).toBe('Pick a channel.');
    expect(scheduleProblem({ channelId: 5, time: '' }, [])).toBe('Pick a time.');
    expect(scheduleProblem({ channelId: 5, time: '21:00' }, [])).toBeNull();
  });

  it('refuses a duplicate for the same channel and time, but not another time or channel', () => {
    expect(scheduleProblem({ channelId: 5, time: '21:00' }, [one()])).toMatch(/already have/);
    expect(scheduleProblem({ channelId: 5, time: '08:00' }, [one()])).toBeNull();
    expect(scheduleProblem({ channelId: 6, time: '21:00' }, [one()])).toBeNull();
  });
});
