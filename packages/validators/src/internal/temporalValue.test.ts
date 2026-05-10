import { parseValue } from './temporalValue';

describe('parseValue', () => {
  test('number', () => {
    expect(parseValue('number', '42')).toBe(42);
    expect(parseValue('number', '-3.14')).toBeCloseTo(-3.14);
    expect(parseValue('number', '1e3')).toBe(1000);
    expect(Number.isNaN(parseValue('number', 'abc'))).toBe(true);
    expect(Number.isNaN(parseValue('number', ''))).toBe(true);
  });

  test('date — UTC midnight ms since epoch', () => {
    expect(parseValue('date', '1970-01-01')).toBe(0);
    expect(parseValue('date', '1970-01-02')).toBe(86_400_000);
    expect(parseValue('date', '2026-05-10')).toBe(Date.UTC(2026, 4, 10));
  });

  test('date — invalid forms', () => {
    expect(Number.isNaN(parseValue('date', '2026-13-01'))).toBe(true);
    expect(Number.isNaN(parseValue('date', '2026-1-1'))).toBe(true); // not zero-padded
    expect(Number.isNaN(parseValue('date', '2026-05-32'))).toBe(true);
    expect(Number.isNaN(parseValue('date', 'not-a-date'))).toBe(true);
  });

  test('time — ms since midnight', () => {
    expect(parseValue('time', '00:00')).toBe(0);
    expect(parseValue('time', '01:00')).toBe(3_600_000);
    expect(parseValue('time', '09:30:15')).toBe(((9 * 60 + 30) * 60 + 15) * 1000);
    expect(parseValue('time', '00:00:00.500')).toBe(500);
  });

  test('time — invalid forms', () => {
    expect(Number.isNaN(parseValue('time', '24:00'))).toBe(true);
    expect(Number.isNaN(parseValue('time', '00:60'))).toBe(true);
    expect(Number.isNaN(parseValue('time', '12'))).toBe(true);
  });

  test('month — months since 1970-01', () => {
    expect(parseValue('month', '1970-01')).toBe(0);
    expect(parseValue('month', '1970-12')).toBe(11);
    expect(parseValue('month', '2026-05')).toBe((2026 - 1970) * 12 + 4);
  });

  test('week — Monday UTC ms of the ISO week', () => {
    // 1970-W01 = Mon Dec 29 1969 UTC.
    expect(parseValue('week', '1970-W01')).toBe(-259_200_000);
    expect(parseValue('week', '1970-W02')).toBe(-259_200_000 + 604_800_000);
    // 2026 is a year where Jan 1 is Thursday → 2026-W01 starts Mon Dec 29 2025.
    expect(parseValue('week', '2026-W01')).toBe(Date.UTC(2025, 11, 29));
    expect(parseValue('week', '2026-W53')).toBe(Date.UTC(2025, 11, 29) + 52 * 604_800_000);
  });

  test('week — invalid forms', () => {
    expect(Number.isNaN(parseValue('week', '2026-W00'))).toBe(true);
    expect(Number.isNaN(parseValue('week', '2026-W54'))).toBe(true);
    expect(Number.isNaN(parseValue('week', '2026-01'))).toBe(true);
  });

  test('datetime-local — UTC ms (interpreted timezone-naïve)', () => {
    expect(parseValue('datetime-local', '1970-01-01T00:00')).toBe(0);
    expect(parseValue('datetime-local', '2026-05-10T09:30')).toBe(Date.UTC(2026, 4, 10, 9, 30));
    expect(parseValue('datetime-local', '2026-05-10T09:30:15')).toBe(Date.UTC(2026, 4, 10, 9, 30, 15));
  });

  test('datetime-local — invalid forms', () => {
    expect(Number.isNaN(parseValue('datetime-local', '2026-05-10'))).toBe(true);
    expect(Number.isNaN(parseValue('datetime-local', '2026-05-10T25:00'))).toBe(true);
  });
});
