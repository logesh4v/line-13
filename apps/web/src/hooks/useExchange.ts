import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { createExchangeAudio } from '../audio/exchangeAudio.ts';
import type { EntityId, EpisodeManifestV1 } from '../contracts.ts';
import { loadBundledEpisode } from '../episode/loadEpisode.ts';
import type { EpisodeLoad } from '../episode/loadEpisode.ts';
import { initialState, reduce } from '../game/reducer.ts';
import type { GameAction, GameState } from '../game/types.ts';
import { activeCues, cuesForEvents, silentCaptions, strongestOnChannel } from '../haunting/cues.ts';
import type { ResolvedCue } from '../haunting/cues.ts';
import type { ExchangeSettings, SettingKey } from '../settings/settings.ts';
import { detectSettings, toggleSetting } from '../settings/settings.ts';

export interface Exchange {
  readonly episode: EpisodeManifestV1;
  readonly load: EpisodeLoad;
  readonly state: GameState;
  readonly settings: ExchangeSettings;
  readonly audioAvailable: boolean;
  /** The live environment effect for the room, or null. */
  readonly environment: string | null;
  /** Exact captions for cues the operator cannot currently hear. */
  readonly captions: readonly string[];
  readonly openExchange: () => void;
  readonly finishIntro: (skipped: boolean) => void;
  /** The camera move the room is making right now, or null. */
  readonly camera: string | null;
  readonly answerCall: (callerId: EntityId) => void;
  readonly reopenCircuit: (callerId: EntityId) => void;
  readonly restart: () => void;
  readonly liftCord: (callerId: EntityId) => void;
  readonly plugCord: (destinationId: EntityId) => void;
  readonly pullCord: () => void;
  readonly closeCircuit: () => void;
  readonly selectEnding: (endingId: EntityId) => void;
  readonly toggle: (key: SettingKey) => void;
}

function matchMediaOrFalse(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/**
 * Wires the pure parts together: the episode at the boundary, the reducer, the
 * cue mapper and the synthesized audio.
 *
 * Everything that decides anything lives in the pure modules. This hook holds
 * only what a browser forces on us — a clock, an audio context, and the live
 * set of cues that have not expired yet.
 */
export function useExchange(): Exchange {
  const load = useMemo(() => loadBundledEpisode(), []);
  const episode = load.episode;

  const [state, dispatch] = useReducer(
    (current: GameState, action: GameAction) => reduce(current, action, episode),
    null,
    initialState,
  );

  const [settings, setSettings] = useState<ExchangeSettings>(() =>
    detectSettings(matchMediaOrFalse),
  );
  const [live, setLive] = useState<readonly ResolvedCue[]>([]);

  const audio = useMemo(() => createExchangeAudio(), []);
  const startedAt = useRef(Date.now());
  const processed = useRef(0);

  const nowMs = useCallback((): number => Date.now() - startedAt.current, []);

  useEffect(() => () => audio.dispose(), [audio]);

  useEffect(() => {
    audio.setMuted(settings.muted);
  }, [audio, settings.muted]);

  /* A new spoken transcript line speaks its Polly file when one matches its
     exact caption; with no match, no audio or no manifest it stays caption-only. */
  const spokenCount = useRef(0);
  useEffect(() => {
    if (state.transcript.length < spokenCount.current) {
      spokenCount.current = 0;
    }
    const fresh = state.transcript.slice(spokenCount.current);
    spokenCount.current = state.transcript.length;
    if (!state.interacted) {
      return;
    }
    for (const line of fresh) {
      if (line.spoken && line.speaker !== 'exchange') {
        audio.speak(line.text);
      }
    }
  }, [audio, state.interacted, state.transcript]);

  // The operating system can change its mind mid-shift.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrast = window.matchMedia('(prefers-contrast: more)');

    function syncMotion(): void {
      setSettings((current) => ({ ...current, reducedMotion: motion.matches }));
    }
    function syncContrast(): void {
      setSettings((current) => ({ ...current, highContrast: contrast.matches }));
    }

    motion.addEventListener('change', syncMotion);
    contrast.addEventListener('change', syncContrast);
    return () => {
      motion.removeEventListener('change', syncMotion);
      contrast.removeEventListener('change', syncContrast);
    };
  }, []);

  /*
   * Before the player's first gesture no browser will make a sound, so a cue
   * resolved as "audible" then would be a cue nobody hears and nobody reads.
   * Treating not-yet-unlocked exactly like muted sends those cues down the
   * silent path they already declare, and the bell arrives as its caption.
   */
  const effectiveSettings = useMemo<ExchangeSettings>(
    () => ({
      ...settings,
      muted: settings.muted || !state.interacted || !audio.isAvailable(),
    }),
    [audio, settings, state.interacted],
  );

  /* Resolve the cues of events that have appeared since the last pass, play
     the ones the operator can hear, and keep the rest for the room to show. */
  useEffect(() => {
    if (state.events.length < processed.current) {
      // A new shift began: the log started over.
      processed.current = 0;
      setLive([]);
    }
    if (state.events.length <= processed.current) {
      return;
    }
    const fresh = state.events.slice(processed.current);
    processed.current = state.events.length;

    const at = nowMs();
    const freshSequences = new Set(fresh.map((event) => event.sequence));
    const resolved = cuesForEvents(
      episode,
      state.events,
      effectiveSettings,
      at,
    ).filter((cue) => freshSequences.has(cue.eventSequence));

    for (const cue of resolved) {
      if (cue.audible && cue.cue.channel === 'sound') {
        audio.play(cue.cue);
      }
    }

    setLive((current) => [...activeCues(current, at), ...resolved]);
  }, [audio, effectiveSettings, episode, nowMs, state.events]);

  /* Expire cues on their own declared duration. */
  useEffect(() => {
    if (live.length === 0) {
      return undefined;
    }
    const soonest = live.reduce(
      (earliest, cue) => Math.min(earliest, cue.expiresAtMs),
      Number.POSITIVE_INFINITY,
    );
    const delay = Math.max(32, soonest - nowMs());
    const timer = window.setTimeout(() => {
      setLive((current) => activeCues(current, nowMs()));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [live, nowMs]);

  const act = useCallback(
    (make: (atMs: number) => GameAction): void => {
      // Any deliberate gesture is also the gesture that unlocks audio.
      audio.unlock();
      dispatch(make(nowMs()));
    },
    [audio, nowMs],
  );

  const openExchange = useCallback((): void => {
    dispatch({ type: 'OPEN_EXCHANGE', atMs: 0 });
  }, []);

  const finishIntro = useCallback(
    (skipped: boolean): void => {
      if (skipped) {
        audio.unlock();
      }
      dispatch({ type: 'FINISH_INTRO', atMs: nowMs(), skipped });
    },
    [audio, nowMs],
  );

  const answerCall = useCallback(
    (callerId: EntityId): void => {
      act((atMs) => ({ type: 'ANSWER_CALL', atMs, callerId }));
    },
    [act],
  );

  const reopenCircuit = useCallback(
    (callerId: EntityId): void => {
      act((atMs) => ({ type: 'REOPEN_CIRCUIT', atMs, callerId }));
    },
    [act],
  );

  const restart = useCallback((): void => {
    dispatch({ type: 'RESTART', atMs: nowMs() });
    dispatch({ type: 'FINISH_INTRO', atMs: nowMs(), skipped: true });
  }, [nowMs]);

  const liftCord = useCallback(
    (callerId: EntityId): void => {
      act((atMs) => ({ type: 'LIFT_CORD', atMs, callerId }));
    },
    [act],
  );

  const plugCord = useCallback(
    (destinationId: EntityId): void => {
      act((atMs) => ({ type: 'PLUG_CORD', atMs, destinationId }));
    },
    [act],
  );

  const pullCord = useCallback((): void => {
    act((atMs) => ({ type: 'PULL_CORD', atMs }));
  }, [act]);

  const closeCircuit = useCallback((): void => {
    act((atMs) => ({ type: 'CLOSE_CIRCUIT', atMs }));
  }, [act]);

  const selectEnding = useCallback(
    (endingId: EntityId): void => {
      act((atMs) => ({ type: 'SELECT_ENDING', atMs, endingId }));
    },
    [act],
  );

  const toggle = useCallback((key: SettingKey): void => {
    setSettings((current) => toggleSetting(current, key));
  }, []);

  const environmentCue = strongestOnChannel(live, 'environment');
  let environment: string | null = null;
  if (
    environmentCue !== null &&
    environmentCue.cue.channel === 'environment' &&
    environmentCue.motion !== 'none'
  ) {
    environment = environmentCue.cue.effect;
  }

  const cameraCue = strongestOnChannel(live, 'camera');
  const camera =
    cameraCue !== null && cameraCue.cue.channel === 'camera' && cameraCue.motion !== 'none'
      ? cameraCue.cue.effect
      : null;

  return {
    episode,
    load,
    camera,
    reopenCircuit,
    restart,
    state,
    settings,
    audioAvailable: audio.isAvailable(),
    environment,
    captions: silentCaptions(live),
    openExchange,
    finishIntro,
    answerCall,
    liftCord,
    plugCord,
    pullCord,
    closeCircuit,
    selectEnding,
    toggle,
  };
}
