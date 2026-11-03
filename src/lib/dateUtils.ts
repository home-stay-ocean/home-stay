import { format, parseISO, differenceInCalendarDays, addDays, isWithinInterval, startOfDay, isBefore, isAfter } from 'date-fns';

/**
 * Formats a Date object or ISO string to YYYY-MM-DD
 */
export function toISODate(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return format(date, 'yyyy-MM-dd');
}

/**
 * Human friendly date: e.g. "Sat, 31 Oct" or "31 Oct 2026"
 */
export function formatDisplayDate(dateStr: string | null | undefined, includeYear: boolean = false): string {
  if (!dateStr) return '-';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return format(d, includeYear ? 'dd MMM yyyy' : 'EEE, dd MMM');
  } catch {
    return dateStr;
  }
}

/**
 * Calculate total nights between check_in and check_out.
 * Note: Check-out day is free for the next guest!
 * Example: In on Nov 1, Out on Nov 3 = 2 nights (Nov 1, Nov 2).
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const start = parseISO(checkIn);
  const end = parseISO(checkOut);
  const diff = differenceInCalendarDays(end, start);
  return Math.max(0, diff);
}

/**
 * Check if two half-open intervals [A_in, A_out) and [B_in, B_out) overlap.
 * Crucial rule: Check-out day is FREE for the next guest!
 * If Booking A checks out on Nov 4, Booking B CAN check in on Nov 4.
 */
export function intervalsOverlap(
  aIn: string,
  aOut: string,
  bIn: string,
  bOut: string
): boolean {
  // A overlaps B iff aIn < bOut AND bIn < aOut
  return aIn < bOut && bIn < aOut;
}

/**
 * Generates an array of dates starting from startDate for `count` days.
 */
export function generateDaysArray(startDate: Date, count: number = 30): Date[] {
  const result: Date[] = [];
  const start = startOfDay(startDate);
  for (let i = 0; i < count; i++) {
    result.push(addDays(start, i));
  }
  return result;
}

/**
 * Checks if a specific day is an occupied night for a booking.
 * Remember: check-out day is not occupied for the night!
 */
export function isDayOccupiedByBooking(day: Date, checkInStr: string, checkOutStr: string): boolean {
  const dayStr = toISODate(day);
  // Occupied if dayStr >= check_in and dayStr < check_out
  return dayStr >= checkInStr && dayStr < checkOutStr;
}

/**
 * Returns today's ISO date string
 */
export function getTodayISO(): string {
  return toISODate(new Date());
}

/**
 * Returns tomorrow's ISO date string
 */
export function getTomorrowISO(): string {
  return toISODate(addDays(new Date(), 1));
}

export type TimeframePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'this_year'
  | 'custom';

export function getTimeframeDates(
  preset: TimeframePreset,
  customStart?: string,
  customEnd?: string
): { startDate?: string; endDate?: string; label: string } {
  const now = new Date();
  const todayStr = toISODate(now);

  switch (preset) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr, label: 'Today (Daily)' };

    case 'yesterday': {
      const yest = addDays(now, -1);
      const yestStr = toISODate(yest);
      return { startDate: yestStr, endDate: yestStr, label: 'Yesterday' };
    }

    case 'this_month': {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const start = `${year}-${month}-01`;
      const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
      const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      return { startDate: start, endDate: end, label: 'This Month' };
    }

    case 'last_month': {
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = lastMonthDate.getFullYear();
      const month = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
      const start = `${year}-${month}-01`;
      const lastDay = new Date(year, lastMonthDate.getMonth() + 1, 0).getDate();
      const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
      return { startDate: start, endDate: end, label: 'Last Month' };
    }

    case 'last_30_days': {
      const start = toISODate(addDays(now, -30));
      return { startDate: start, endDate: todayStr, label: 'Last 30 Days' };
    }

    case 'this_year': {
      const year = now.getFullYear();
      return { startDate: `${year}-01-01`, endDate: `${year}-12-31`, label: 'This Year' };
    }

    case 'custom': {
      const start = customStart && customStart.trim() ? customStart.trim() : undefined;
      const end = customEnd && customEnd.trim() ? customEnd.trim() : undefined;
      let label = 'Custom Range';
      if (start && end) {
        label = `${formatDisplayDate(start)} → ${formatDisplayDate(end)}`;
      } else if (start) {
        label = `From ${formatDisplayDate(start)}`;
      } else if (end) {
        label = `Until ${formatDisplayDate(end)}`;
      }
      return { startDate: start, endDate: end, label };
    }

    case 'all':
    default:
      return { startDate: undefined, endDate: undefined, label: 'All Time' };
  }
}

/**
 * Checks if a date string YYYY-MM-DD falls within [startDate, endDate] (inclusive)
 */
export function isDateInDateRange(
  dateStr: string | null | undefined,
  startDate?: string,
  endDate?: string
): boolean {
  if (!dateStr) return false;
  const d = dateStr.split('T')[0];
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

/**
 * Checks if a booking's stay [check_in, check_out] overlaps a timeframe [startDate, endDate]
 */
export function isBookingInDateRange(
  checkInStr: string | null | undefined,
  checkOutStr: string | null | undefined,
  startDate?: string,
  endDate?: string
): boolean {
  if (!checkInStr || !checkOutStr) return false;
  const inDate = checkInStr.split('T')[0];
  const outDate = checkOutStr.split('T')[0];

  if (startDate && endDate) {
    return inDate <= endDate && outDate >= startDate;
  }
  if (startDate) {
    return outDate >= startDate;
  }
  if (endDate) {
    return inDate <= endDate;
  }
  return true;
}
