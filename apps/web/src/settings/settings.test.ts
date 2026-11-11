import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CONTROL_ENGRAVINGS,
  DEFAULT_SETTINGS,
  QUERY_HIGH_CONTRAST,
  QUERY_REDUCED_MOTION,
  detectSettings,
  positionWord,
  toggleSetting,
} from './settings.ts';

describe('the control strip', () => {
  it('offers exactly the four controls the requirements name', () => {
    assert.deepEqual(
      CONTROL_ENGRAVINGS.map((control) => control.key),
      ['muted', 'subtitles', 'reducedMotion', 'highContrast'],
    );
  });

  it('engraves a word for both positions of every switch', () => {
    for (const control of CONTROL_ENGRAVINGS) {
      assert.notEqual(control.engraving.trim(), '');
      assert.notEqual(control.onWord.trim(), '');
      assert.notEqual(control.offWord.trim(), '');
      assert.notEqual(control.onWord, control.offWord);
      assert.notEqual(control.accessibleName.trim(), '');
    }
  });

  it('reads out the position a switch is actually in', () => {
    const sound = CONTROL_ENGRAVINGS[0];
    assert.ok(sound !== undefined);
    assert.equal(positionWord({ ...DEFAULT_SETTINGS, muted: false }, sound), 'LIVE');
    assert.equal(positionWord({ ...DEFAULT_SETTINGS, muted: true }, sound), 'CUT');
  });
});

describe('defaults', () => {
  it('starts with sound live and subtitles already printing', () => {
    assert.equal(DEFAULT_SETTINGS.muted, false);
    assert.equal(DEFAULT_SETTINGS.subtitles, true);
  });

  it('takes reduced motion and high contrast from the operating system', () => {
    const detected = detectSettings((query) => query === QUERY_REDUCED_MOTION);
    assert.equal(detected.reducedMotion, true);
    assert.equal(detected.highContrast, false);

    const contrast = detectSettings((query) => query === QUERY_HIGH_CONTRAST);
    assert.equal(contrast.highContrast, true);
    assert.equal(contrast.reducedMotion, false);

    const neither = detectSettings(() => false);
    assert.deepEqual(neither, DEFAULT_SETTINGS);
  });
});

describe('toggleSetting', () => {
  it('moves one switch and leaves the others where they were', () => {
    const next = toggleSetting(DEFAULT_SETTINGS, 'muted');
    assert.equal(next.muted, true);
    assert.equal(next.subtitles, DEFAULT_SETTINGS.subtitles);
    assert.equal(next.reducedMotion, DEFAULT_SETTINGS.reducedMotion);
    assert.equal(next.highContrast, DEFAULT_SETTINGS.highContrast);
  });

  it('returns a new object rather than editing the old one', () => {
    const next = toggleSetting(DEFAULT_SETTINGS, 'subtitles');
    assert.notEqual(next, DEFAULT_SETTINGS);
    assert.equal(DEFAULT_SETTINGS.subtitles, true);
  });
});
