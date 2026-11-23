const DAY_MS = 86_400_000;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number;
};

const WEEKDAYS: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

function partsIn(date: Date, timeZone?: string): DateParts {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      weekday: (date.getDay() + 6) % 7,
    };
  }

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return {
      year: Number(value("year")),
      month: Number(value("month")),
      day: Number(value("day")),
      hour: Number(value("hour")),
      weekday: WEEKDAYS[value("weekday")] ?? 0,
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      weekday: (date.getUTCDay() + 6) % 7,
    };
  }
}

function dateOrdinal(parts: Pick<DateParts, "year" | "month" | "day">): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

export function calendarSprintDay(planStart: string | null, now = new Date(), timeZone?: string): number {
  if (!planStart) return 1;
  const start = new Date(planStart);
  if (!Number.isFinite(start.getTime())) return 1;
  return Math.max(1, dateOrdinal(partsIn(now, timeZone)) - dateOrdinal(partsIn(start, timeZone)) + 1);
}

export function sprintEndDate(planStart: string | null): Date | null {
  if (!planStart) return null;
  const start = new Date(planStart);
  if (!Number.isFinite(start.getTime())) return null;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 27, 12);
}

export function sprintDaysAfterToday(day: number): number {
  return Math.max(0, 28 - Math.min(28, Math.max(1, day)));
}

export function localSchedule(now: Date, timeZone: string): { dateKey: string; hour: number; weekday: number } {
  const parts = partsIn(now, timeZone);
  return {
    dateKey: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    hour: parts.hour,
    weekday: parts.weekday,
  };
}

export function isSelectedNudgeDay(selectedDays: unknown, weekday: number): boolean {
  if (!Array.isArray(selectedDays) || selectedDays.length === 0) return true;
  return selectedDays.some((day) => Number.isInteger(day) && day === weekday);
}

export const JOURNEY_CHECKPOINT_DAYS = [7, 14, 21, 28] as const;

export type JourneyNudgeReason = "selected_day" | "checkpoint";

export function journeyNudgeReason(selectedDays: unknown, weekday: number, sprintDay: number): JourneyNudgeReason | null {
  if (JOURNEY_CHECKPOINT_DAYS.includes(sprintDay as (typeof JOURNEY_CHECKPOINT_DAYS)[number])) return "checkpoint";
  return isSelectedNudgeDay(selectedDays, weekday) ? "selected_day" : null;
}

export function scheduledNudgeHour(edition: "morning" | "evening", quietStart = "21:00", quietEnd = "08:00"): number {
  const parseHour = (value: string, fallback: number) => {
    const match = /^(\d{1,2}):\d{2}/.exec(value);
    const hour = Number(match?.[1]);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
  };
  if (edition === "morning") return parseHour(quietEnd, 8);
  return (parseHour(quietStart, 21) + 23) % 24;
}
