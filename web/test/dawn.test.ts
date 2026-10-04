import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { dawnState, guessCoords, nextSunrise, sunriseOn, untilDawn } from '../src/lib/dawn.ts';

const CHICAGO = { lat: 41.88, lon: -87.63 };
const near = (a: Date, iso: string, minutes = 4) =>
  assert.ok(Math.abs(a.getTime() - new Date(iso).getTime()) <= minutes * 60_000, `${a.toISOString()} not within ${minutes} min of ${iso}`);

describe('dawn', () => {
  it('puts sunrise where the almanac does', () => {
    // Published sunrises: Chicago 2026-10-03 about 06:49 CDT; London 2026-06-21 about 04:43 BST; Sydney 2026-12-21 about 05:41 AEDT.
    near(sunriseOn(new Date('2026-10-03T12:00:00Z'), CHICAGO.lat, CHICAGO.lon)!, '2026-10-03T11:49:00Z');
    near(sunriseOn(new Date('2026-06-21T12:00:00Z'), 51.51, -0.13)!, '2026-06-21T03:43:00Z');
    near(sunriseOn(new Date('2026-12-20T12:00:00Z'), -33.87, 151.21)!, '2026-12-20T18:41:00Z');
  });

  it('finds the next sunrise, rolling past one that already happened', () => {
    near(nextSunrise(new Date('2026-10-03T13:00:00Z'), CHICAGO)!, '2026-10-04T11:50:00Z');
    near(nextSunrise(new Date('2026-10-03T05:00:00Z'), CHICAGO)!, '2026-10-03T11:49:00Z');
  });

  it('warns only in the half hour before sunrise', () => {
    const sunrise = sunriseOn(new Date('2026-10-03T12:00:00Z'), CHICAGO.lat, CHICAGO.lon)!;
    const at = (minutesBefore: number) => dawnState(new Date(sunrise.getTime() - minutesBefore * 60_000), CHICAGO);
    assert.equal(at(45).minutes, null);
    assert.equal(at(30).minutes, 30);
    assert.equal(at(10).minutes, 10);
    assert.ok(at(10).progress > at(25).progress);
    assert.equal(dawnState(new Date(sunrise.getTime() + 60_000), CHICAGO).minutes, null, 'gone once the sun is up');
  });

  it('says nothing in a polar night', () => {
    assert.equal(sunriseOn(new Date('2026-12-21T12:00:00Z'), 78.22, 15.63), null);
    assert.equal(dawnState(new Date('2026-12-21T06:00:00Z'), { lat: 78.22, lon: 15.63 }).minutes, null);
  });

  it('counts hours and minutes until dawn', () => {
    const sunrise = sunriseOn(new Date('2026-10-03T12:00:00Z'), CHICAGO.lat, CHICAGO.lon)!;
    assert.equal(untilDawn(new Date(sunrise.getTime() - (2 * 60 + 14) * 60_000), CHICAGO), '2 h 14 m');
    assert.equal(untilDawn(new Date('2026-12-21T06:00:00Z'), { lat: 78.22, lon: 15.63 }), null);
  });

  it('guesses from the time zone, then the offset', () => {
    assert.deepEqual(guessCoords('America/Chicago', 300), { lat: 41.88, lon: -87.63, source: 'zone' });
    assert.deepEqual(guessCoords('Etc/Unknown', 300), { lat: 40, lon: -75, source: 'offset' });
  });
});
