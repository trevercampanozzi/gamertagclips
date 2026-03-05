// /netlify/functions/_week.js
const TZ = "America/Chicago";

function partsInTZ(date = new Date(), timeZone = TZ) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: get("weekday"), // Mon, Tue...
  };
}

function weekdayIndex(w) {
  // Mon=1..Sun=7
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[w] || 1;
}

function tzOffsetMs(utcDate, timeZone = TZ) {
  // offset = localAsUTC - utc
  const p = partsInTZ(utcDate, timeZone);
  const localAsUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return localAsUTC - utcDate.getTime();
}

function localToUTCms(y, m, d, hh, mm, ss, timeZone = TZ) {
  // iterative conversion so DST works
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  let utc = guess - tzOffsetMs(new Date(guess), timeZone);
  utc = guess - tzOffsetMs(new Date(utc), timeZone);
  return utc;
}

function addDaysLocal(y, m, d, days) {
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // noon UTC avoids edge cases
  dt.setUTCDate(dt.getUTCDate() + days);
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

export function getCompetitionWindow(now = new Date()) {
  const p = partsInTZ(now, TZ);
  const wd = weekdayIndex(p.weekday);

  // Find Monday of "this week" in Chicago
  // If it's Monday BEFORE 3am, treat as previous week.
  let daysBackToMonday = wd - 1; // Mon=0, Tue=1... Sun=6
  let monday = addDaysLocal(p.year, p.month, p.day, -daysBackToMonday);

  // If Monday and before 3am -> use previous week's Monday
  if (wd === 1 && p.hour < 3) {
    monday = addDaysLocal(monday.year, monday.month, monday.day, -7);
  }

  const weekStartUtcMs = localToUTCms(monday.year, monday.month, monday.day, 3, 0, 0, TZ);

  // Close = Sunday 5pm of that same competition week
  const sunday = addDaysLocal(monday.year, monday.month, monday.day, 6);
  const closeUtcMs = localToUTCms(sunday.year, sunday.month, sunday.day, 17, 0, 0, TZ);

  // Next week start = next Monday 3am
  const nextMonday = addDaysLocal(monday.year, monday.month, monday.day, 7);
  const nextWeekStartUtcMs = localToUTCms(nextMonday.year, nextMonday.month, nextMonday.day, 3, 0, 0, TZ);

  const weekKey = `${String(monday.year).padStart(4, "0")}-${String(monday.month).padStart(2, "0")}-${String(monday.day).padStart(2, "0")}`;

  const nowMs = now.getTime();
  const isOpen = nowMs >= weekStartUtcMs && nowMs < closeUtcMs;
  const isClosed = nowMs >= closeUtcMs && nowMs < nextWeekStartUtcMs;

  return {
    timeZone: TZ,
    week: weekKey,
    weekStartUtcMs,
    closeUtcMs,
    nextWeekStartUtcMs,
    isOpen,
    isClosed,
    nowMs,
  };
}