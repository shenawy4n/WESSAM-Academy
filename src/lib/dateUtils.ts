/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const ACADEMIC_TIMEZONE = 'Asia/Riyadh';

/**
 * Formats a UTC ISO timestamp into Saudi Arabia local time (Asia/Riyadh).
 */
export function formatRiyadhDateTime(
  isoDateStr: string | null | undefined,
  options?: {
    locale?: 'ar' | 'en';
    includeTime?: boolean;
    includeDate?: boolean;
    includeSeconds?: boolean;
  }
): string {
  if (!isoDateStr) return '';

  const date = new Date(isoDateStr);
  if (isNaN(date.getTime())) return '';

  const locale = options?.locale === 'ar' ? 'ar-SA' : 'en-US';
  const includeTime = options?.includeTime !== false;
  const includeDate = options?.includeDate !== false;

  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: ACADEMIC_TIMEZONE,
  };

  if (includeDate) {
    formatOptions.year = 'numeric';
    formatOptions.month = 'short';
    formatOptions.day = 'numeric';
    formatOptions.weekday = 'short';
  }

  if (includeTime) {
    formatOptions.hour = 'numeric';
    formatOptions.minute = '2-digit';
    if (options?.includeSeconds) {
      formatOptions.second = '2-digit';
    }
  }

  return new Intl.DateTimeFormat(locale, formatOptions).format(date);
}

/**
 * Returns a time-only string in Asia/Riyadh (e.g. "8:30 PM" or "٨:٣٠ م").
 */
export function formatRiyadhTime(isoDateStr: string | null | undefined, locale: 'ar' | 'en' = 'en'): string {
  return formatRiyadhDateTime(isoDateStr, { locale, includeDate: false, includeTime: true });
}

/**
 * Returns a date-only string in Asia/Riyadh (e.g. "Sat, Nov 7, 2026").
 */
export function formatRiyadhDate(isoDateStr: string | null | undefined, locale: 'ar' | 'en' = 'en'): string {
  return formatRiyadhDateTime(isoDateStr, { locale, includeDate: true, includeTime: false });
}

/**
 * Combines an Asia/Riyadh local date string (YYYY-MM-DD) and time string (HH:mm)
 * into a standard UTC ISO 8601 string.
 * Note: Saudi Arabia is fixed at UTC+3 (AST) year-round without daylight saving.
 */
export function riyadhToUtcIso(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return '';
  const cleanDate = dateStr.trim();
  const cleanTime = timeStr.trim();
  // Construct ISO with +03:00 offset
  const dateTimeWithOffset = `${cleanDate}T${cleanTime.length === 5 ? cleanTime + ':00' : cleanTime}+03:00`;
  const d = new Date(dateTimeWithOffset);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date/time for Riyadh timezone: ${dateStr} ${timeStr}`);
  }
  return d.toISOString();
}

/**
 * Extracts the local YYYY-MM-DD and HH:mm in Asia/Riyadh from a UTC ISO string,
 * suitable for HTML date & time input elements.
 */
export function utcToRiyadhInputs(isoDateStr: string | null | undefined): { date: string; time: string } {
  if (!isoDateStr) return { date: '', time: '' };
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return { date: '', time: '' };

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ACADEMIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  let year = '';
  let month = '';
  let day = '';
  let hour = '';
  let minute = '';

  for (const p of parts) {
    if (p.type === 'year') year = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'day') day = p.value;
    if (p.type === 'hour') hour = p.value;
    if (p.type === 'minute') minute = p.value;
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

/**
 * Session status helpers based on scheduled start and end timestamps.
 */
export function isSessionUpcoming(startTimeIso: string): boolean {
  const start = new Date(startTimeIso).getTime();
  const now = Date.now();
  return start > now;
}

export function isSessionLive(startTimeIso: string, endTimeIsoOrDurationMinutes: string | number): boolean {
  const start = new Date(startTimeIso).getTime();
  let end: number;
  if (typeof endTimeIsoOrDurationMinutes === 'number') {
    end = start + endTimeIsoOrDurationMinutes * 60 * 1000;
  } else {
    end = new Date(endTimeIsoOrDurationMinutes).getTime();
  }
  const now = Date.now();
  return now >= start && now <= end;
}

export function isSessionPast(endTimeIso: string): boolean {
  const end = new Date(endTimeIso).getTime();
  const now = Date.now();
  return end < now;
}

/**
 * Calculates attendance metrics and compliance rate percentage.
 * Excludes cancelled sessions or excused absences from penalized total.
 */
export interface AttendanceStats {
  present: number;
  late: number;
  excused: number;
  absent: number;
  total: number;
  percentage: number;
}

export function calculateAttendanceMetrics(records: { status: string }[]): AttendanceStats {
  let present = 0;
  let late = 0;
  let excused = 0;
  let absent = 0;

  for (const r of records) {
    if (r.status === 'present') present++;
    else if (r.status === 'late') late++;
    else if (r.status === 'excused') excused++;
    else if (r.status === 'absent') absent++;
  }

  const total = present + late + excused + absent;
  // Effective sessions that count towards attendance compliance (excluding excused)
  const countableTotal = present + late + absent;
  const percentage = countableTotal === 0 ? 100 : Math.round(((present + late) / countableTotal) * 100);

  return {
    present,
    late,
    excused,
    absent,
    total,
    percentage,
  };
}
