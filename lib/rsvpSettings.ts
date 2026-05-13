export const DEFAULT_RSVP_BY_DATE = "May 1, 2026";
export const RSVP_BY_DATE_SETTING_KEY = "rsvp_by_date";
export const RSVP_BY_DATE_VISIBILITY_SETTING_KEY = "is_rsvp_by_date_visible";
export const RSVP_BY_DATE_FALLBACK = process.env.NEXT_PUBLIC_RSVP_BY_DATE?.trim() || DEFAULT_RSVP_BY_DATE;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const getRsvpByDateValue = (value?: string | null) => value?.trim() || RSVP_BY_DATE_FALLBACK;

export const getRsvpByDateVisibility = (value?: string | null) => (value ? value !== "false" : true);

const parseRsvpDate = (value: string) => {
  const isoMatch = value.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatRsvpByDateLabel = (value?: string | null) => {
  const rsvpByDate = getRsvpByDateValue(value);
  const parsed = parseRsvpDate(rsvpByDate);

  if (!parsed) return rsvpByDate;

  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

export const toRsvpDateInputValue = (value?: string | null) => {
  const rsvpByDate = getRsvpByDateValue(value);
  const isoMatch = rsvpByDate.match(ISO_DATE_PATTERN);

  if (isoMatch) return rsvpByDate;

  const parsed = parseRsvpDate(rsvpByDate);
  if (!parsed) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};
