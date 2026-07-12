'use strict';

/**
 * Formats a UTC datetime string (as produced by SQLite's `datetime('now')`)
 * for display in the Tunisian time zone (UTC+1).
 *
 * Input:  "2026-07-12 14:30:00" (UTC)
 * Output: "12 juil. 2026, 15:30" (Tunis local time, French locale)
 *
 * Returns the raw string unchanged if it can't be parsed, so a view never
 * breaks on a malformed value.
 */
function formatDate(utcString) {
  if (!utcString) return '';

  // SQLite datetime strings lack a timezone indicator, so appending 'Z'
  // tells the Date parser to treat them as UTC rather than local time.
  const date = new Date(utcString.replace(' ', 'T') + 'Z');

  if (isNaN(date.getTime())) {
    return utcString; // fallback: return as-is rather than showing "Invalid Date"
  }

  return new Intl.DateTimeFormat('fr-TN', {
    timeZone: 'Africa/Tunis',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

module.exports = formatDate;
