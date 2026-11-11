/**
 * Stable ids for the exchange's own sound effects.
 *
 * Every id here is SYNTHESIZED at runtime by `audio/synth.ts` from oscillators
 * and seeded noise. The package ships no audio binaries and fetches no remote
 * media, so the judge path needs nothing but the bundle.
 *
 * Caller speech is different: those are immutable Amazon Polly assets listed in
 * the episode manifest and addressed by their manifest `assetId`. The adapter
 * resolves those through an injected loader, which is why a missing or
 * undecodable voice asset degrades to its exact subtitle instead of failing.
 */
export const ORIGINAL_SOUND_ASSET_IDS = [
  'sfx.bell.ring',
  'sfx.bell.thirteen',
  'sfx.jack.contact',
  'sfx.cord.pull',
  'sfx.relay.click',
  'sfx.line.static',
  'sfx.line.hum',
  'sfx.line.reverse',
  'sfx.ticket.stamp',
  'sfx.exchange.close',
] as const;

export type OriginalSoundAssetId = (typeof ORIGINAL_SOUND_ASSET_IDS)[number];

const ORIGINAL_SOUND_ASSET_SET: ReadonlySet<string> = new Set(ORIGINAL_SOUND_ASSET_IDS);

/** True when this asset id is one the package synthesizes itself. */
export function isOriginalSoundAsset(assetId: string): assetId is OriginalSoundAssetId {
  return ORIGINAL_SOUND_ASSET_SET.has(assetId);
}
