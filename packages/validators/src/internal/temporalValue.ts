// Shared parsing / arithmetic for the input types that `min`, `max`, `step`,
// and `numeric` support. We intentionally don't rely on the element's
// `valueAsNumber` — jsdom's coverage is patchy for date/time/etc., and
// rolling our own keeps behavior identical across runtimes.

const SUPPORTED_TYPES = [
  'number',
  'date',
  'time',
  'month',
  'week',
  'datetime-local',
] as const;

type SupportedType = typeof SUPPORTED_TYPES[number];

// Step argument unit → valueAsNumber unit. Mirrors HTML's "step scale factor".
const SCALE: Record<SupportedType, number> = {
  number: 1,
  date: 86_400_000,
  time: 1000,
  month: 1,
  week: 604_800_000,
  'datetime-local': 1000,
};

// Default step base when not specified. For week, the HTML spec base is the
// Monday of 1970-W01 (Dec 29 1969 UTC); zero would land on Thursday Jan 1 1970
// and reject every well-formed week value. For everything else zero already
// aligns with a natural anchor (epoch / midnight / 1970-01).
const DEFAULT_BASE: Record<SupportedType, number> = {
  number: 0,
  date: 0,
  time: 0,
  month: 0,
  week: -259_200_000,
  'datetime-local': 0,
};

function isSupportedType(type: string | null | undefined): type is SupportedType {
  return type != null && (SUPPORTED_TYPES as readonly string[]).includes(type);
}

function parseValue(type: SupportedType, str: string): number {
  if (str === '') return NaN;
  switch (type) {
    case 'number': {
      const n = Number(str);
      return Number.isFinite(n) ? n : NaN;
    }
    case 'date': {
      const m = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(str);
      if (!m) return NaN;
      const year = +m[1];
      const month = +m[2];
      const day = +m[3];
      if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;
      return Date.UTC(year, month - 1, day);
    }
    case 'time': {
      const m = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(str);
      if (!m) return NaN;
      const h = +m[1];
      const min = +m[2];
      const s = m[3] ? +m[3] : 0;
      const ms = m[4] ? Number(`0.${m[4]}`) * 1000 : 0;
      if (h > 23 || min > 59 || s > 59) return NaN;
      return ((h * 60 + min) * 60 + s) * 1000 + ms;
    }
    case 'month': {
      const m = /^(\d{4,})-(\d{2})$/.exec(str);
      if (!m) return NaN;
      const year = +m[1];
      const month = +m[2];
      if (month < 1 || month > 12) return NaN;
      return (year - 1970) * 12 + (month - 1);
    }
    case 'week': {
      const m = /^(\d{4,})-W(\d{2})$/.exec(str);
      if (!m) return NaN;
      const year = +m[1];
      const week = +m[2];
      if (week < 1 || week > 53) return NaN;
      // ISO 8601: Jan 4 of the week-numbering year is always in week 1.
      const jan4 = Date.UTC(year, 0, 4);
      const jan4Day = new Date(jan4).getUTCDay() || 7; // 1=Mon..7=Sun
      const week1Monday = jan4 - (jan4Day - 1) * 86_400_000;
      return week1Monday + (week - 1) * 604_800_000;
    }
    case 'datetime-local': {
      const m = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(str);
      if (!m) return NaN;
      const year = +m[1];
      const month = +m[2];
      const day = +m[3];
      const h = +m[4];
      const min = +m[5];
      const s = m[6] ? +m[6] : 0;
      const ms = m[7] ? Number(`0.${m[7]}`) * 1000 : 0;
      if (month < 1 || month > 12 || day < 1 || day > 31 || h > 23 || min > 59 || s > 59) return NaN;
      return Date.UTC(year, month - 1, day, h, min, s, ms);
    }
    default:
      return NaN;
  }
}

function readElementValue(input: HTMLInputElement, type: SupportedType): number {
  // Real browsers sanitize unparseable input to '' and surface it via
  // validity.badInput. We treat that as NaN so callers can short-circuit.
  if (input.validity.badInput) return NaN;
  return parseValue(type, input.value);
}

export {
  DEFAULT_BASE,
  SCALE,
  SUPPORTED_TYPES,
  isSupportedType,
  parseValue,
  readElementValue,
};
export type { SupportedType };
