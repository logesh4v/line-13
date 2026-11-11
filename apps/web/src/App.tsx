import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';

import type { ClosedCircuit } from './components/RoutingTicket.tsx';

import { EndingPlate } from './components/EndingPlate.tsx';
import { Entrance } from './components/Entrance.tsx';
import { ExchangeControls } from './components/ExchangeControls.tsx';
import { RailGlass } from './components/RailGlass.tsx';
import { RoutingTicket } from './components/RoutingTicket.tsx';
import { StatusPlate } from './components/StatusPlate.tsx';
import { Switchboard } from './components/Switchboard.tsx';
import { DORMANT_LINE_LABELS } from './episode/bundled-episode.ts';
import { promptText, statusText } from './game/status.ts';
import { useExchange } from './hooks/useExchange.ts';
import {
  boardJacks,
  canCloseCircuit,
  canPullCord,
  currentSubtitle,
  readyEnding,
  revealedClues,
  routeSummary,
  selectedEnding,
} from './selectors.ts';

/**
 * The operator room.
 *
 * The switchboard is the first viewport and the whole page: there is no landing
 * page, no hero, no dashboard and no menu in front of it. The entrance plays
 * over the board rather than instead of it, so skipping lands straight on a
 * ringing lamp.
 */
export function App(): ReactElement {
  const exchange = useExchange();
  const { episode, state, settings, openExchange } = exchange;
  const board = useRef<HTMLDivElement | null>(null);

  // Open the exchange on first paint; the entrance takes it from there.
  useEffect(() => {
    openExchange();
  }, [openExchange]);

  /* Contrast and motion live on the document element so the custom properties
     reach the fixed overlays as well as the room. */
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.contrast = settings.highContrast ? 'high' : 'lamp';
    root.dataset.motion = settings.reducedMotion ? 'held' : 'full';
  }, [settings.highContrast, settings.reducedMotion]);

  /* When the entrance ends, hand the keyboard straight to the ringing line. */
  useEffect(() => {
    if (state.phase !== 'ORIENTATION') {
      return;
    }
    const first = board.current?.querySelector<HTMLButtonElement>('button.jack:not(:disabled)');
    first?.focus();
  }, [state.phase]);

  const caller =
    state.activeCallerId === null
      ? null
      : (episode.callers.find((candidate) => candidate.id === state.activeCallerId) ?? null);

  const ending = selectedEnding(state, episode);
  const pending = readyEnding(state, episode);
  const sigil = state.phase === 'LINE_13' || state.phase === 'ENDING';
  const routing = state.phase === 'ROUTING' || state.phase === 'ESCALATION';

  const circuits: readonly ClosedCircuit[] = state.confirmedRoutes.map((route) => {
    const from = episode.callers.find((candidate) => candidate.id === route.callerId);
    const to = episode.destinations.find((candidate) => candidate.id === route.destinationId);
    return {
      callerId: route.callerId,
      text: `${from?.displayName ?? route.callerId} → ${to?.label ?? route.destinationId}`,
    };
  });

  return (
    <>
      {state.phase === 'INTRO' ? (
        <Entrance reducedMotion={settings.reducedMotion} onFinish={exchange.finishIntro} />
      ) : null}

      <div
        className="room"
        data-haunt={state.haunt}
        data-phase={state.phase}
        {...(exchange.environment === null ? {} : { 'data-environment': exchange.environment })}
        {...(exchange.camera === null ? {} : { 'data-camera': exchange.camera })}
      >
        <StatusPlate
          status={statusText(state, episode)}
          prompt={promptText(state)}
          notice={exchange.load.notice}
        />

        <div className="board-shell">
          <div ref={board}>
            <Switchboard
              jacks={boardJacks(state, episode)}
              dormantLabels={DORMANT_LINE_LABELS}
              cord={state.cord}
              closedRoutes={state.confirmedRoutes}
              sigil={sigil}
              sigilLabel={`Ritual sigil drawn by your routes. ${routeSummary(state, episode)}`}
              reducedMotion={settings.reducedMotion}
              onAnswerCall={exchange.answerCall}
              onLiftCord={exchange.liftCord}
              onPlugCord={exchange.plugCord}
              onAnswerLine13={() => {
                if (pending !== null) {
                  exchange.selectEnding(pending.id);
                }
              }}
            />
          </div>

          <div className="rail">
            <RoutingTicket
              caller={caller}
              clues={revealedClues(state, episode).filter(
                (clue) => caller?.clueIds.includes(clue.id) ?? false,
              )}
              destinations={episode.destinations}
              circuits={circuits}
              canReopen={routing && (state.cord.kind === 'idle' || state.cord.kind === 'closed')}
              onReopen={exchange.reopenCircuit}
              canCloseCircuit={canCloseCircuit(state)}
              canPullCord={canPullCord(state)}
              onCloseCircuit={exchange.closeCircuit}
              onPullCord={exchange.pullCord}
            />
            <ExchangeControls
              settings={settings}
              onToggle={exchange.toggle}
              audioAvailable={exchange.audioAvailable}
            />
          </div>
        </div>

        <RailGlass
          line={currentSubtitle(state)}
          subtitlesOn={settings.subtitles}
          captions={exchange.captions}
        />
      </div>

      {ending === null ? null : (
        <EndingPlate
          ending={ending}
          allEndings={episode.endings}
          onRestart={exchange.restart}
          routeSummary={routeSummary(state, episode)}
          crossedLineCount={state.crossedLineCount}
        />
      )}
    </>
  );
}
