/**
 * Slot generation reference implementation.
 *
 * This is framework-agnostic TypeScript intended for Next.js API usage.
 * Requires `luxon` at runtime.
 */

import { DateTime } from 'luxon';

export type AvailabilityRule = {
  weekday: number; // 0 (Sun) -> 6 (Sat)
  startLocalTime: string; // "HH:mm"
  endLocalTime: string; // "HH:mm"
  effectiveFrom?: string; // "YYYY-MM-DD"
  effectiveTo?: string; // "YYYY-MM-DD"
};

export type AvailabilityException = {
  dateLocal: string; // "YYYY-MM-DD"
  type: 'blocked' | 'added';
  startLocalTime: string;
  endLocalTime: string;
};

export type SlotWindow = {
  startUtcIso: string;
  endUtcIso: string;
};

type TimeRange = { startLocalTime: string; endLocalTime: string };

export function generateSlotsForRange(params: {
  teacherTimezone: string;
  rangeStartLocalDate: string; // inclusive
  rangeEndLocalDate: string; // inclusive
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  lessonLengthMinutes: number;
  bufferMinutes: number;
}): SlotWindow[] {
  const {
    teacherTimezone,
    rangeStartLocalDate,
    rangeEndLocalDate,
    rules,
    exceptions,
    lessonLengthMinutes,
    bufferMinutes,
  } = params;

  const startDate = DateTime.fromISO(rangeStartLocalDate, { zone: teacherTimezone }).startOf('day');
  const endDate = DateTime.fromISO(rangeEndLocalDate, { zone: teacherTimezone }).startOf('day');

  if (!startDate.isValid || !endDate.isValid || endDate < startDate) {
    throw new Error('Invalid local date range for slot generation.');
  }

  const slots: SlotWindow[] = [];

  for (let day = startDate; day <= endDate; day = day.plus({ days: 1 })) {
    const jsWeekday = day.weekday % 7; // Luxon: Mon=1..Sun=7 -> Sun=0

    const baseRanges: TimeRange[] = rules
      .filter((r) => r.weekday === jsWeekday)
      .filter((r) => isRuleActiveOnDate(r, day.toISODate()!))
      .map((r) => ({ startLocalTime: r.startLocalTime, endLocalTime: r.endLocalTime }));

    const dayExceptions = exceptions.filter((e) => e.dateLocal === day.toISODate());

    const blockedRanges = dayExceptions
      .filter((e) => e.type === 'blocked')
      .map((e) => ({ startLocalTime: e.startLocalTime, endLocalTime: e.endLocalTime }));

    const addedRanges = dayExceptions
      .filter((e) => e.type === 'added')
      .map((e) => ({ startLocalTime: e.startLocalTime, endLocalTime: e.endLocalTime }));

    const finalRanges = subtractBlockedRanges(baseRanges, blockedRanges).concat(addedRanges);

    for (const range of finalRanges) {
      const [startHour, startMinute] = range.startLocalTime.split(':').map(Number);
      const [endHour, endMinute] = range.endLocalTime.split(':').map(Number);

      let cursor = day.set({ hour: startHour, minute: startMinute });
      const rangeEnd = day.set({ hour: endHour, minute: endMinute });

      while (cursor.plus({ minutes: lessonLengthMinutes }) <= rangeEnd) {
        const lessonEnd = cursor.plus({ minutes: lessonLengthMinutes });

        slots.push({
          startUtcIso: cursor.toUTC().toISO()!,
          endUtcIso: lessonEnd.toUTC().toISO()!,
        });

        cursor = lessonEnd.plus({ minutes: bufferMinutes });
      }
    }
  }

  return slots;
}

function isRuleActiveOnDate(rule: AvailabilityRule, isoDate: string): boolean {
  const fromOk = !rule.effectiveFrom || isoDate >= rule.effectiveFrom;
  const toOk = !rule.effectiveTo || isoDate <= rule.effectiveTo;
  return fromOk && toOk;
}

function subtractBlockedRanges(baseRanges: TimeRange[], blockedRanges: TimeRange[]): TimeRange[] {
  if (blockedRanges.length === 0) return baseRanges;

  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const fromMinutes = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  const blocked = blockedRanges.map((r) => [toMinutes(r.startLocalTime), toMinutes(r.endLocalTime)] as const);

  const output: TimeRange[] = [];

  for (const r of baseRanges) {
    let segments: Array<[number, number]> = [[toMinutes(r.startLocalTime), toMinutes(r.endLocalTime)]];

    for (const [bStart, bEnd] of blocked) {
      const next: Array<[number, number]> = [];

      for (const [sStart, sEnd] of segments) {
        if (bEnd <= sStart || bStart >= sEnd) {
          next.push([sStart, sEnd]);
          continue;
        }
        if (bStart > sStart) next.push([sStart, bStart]);
        if (bEnd < sEnd) next.push([bEnd, sEnd]);
      }

      segments = next;
      if (segments.length === 0) break;
    }

    for (const [sStart, sEnd] of segments) {
      if (sEnd > sStart) {
        output.push({ startLocalTime: fromMinutes(sStart), endLocalTime: fromMinutes(sEnd) });
      }
    }
  }

  return output;
}
