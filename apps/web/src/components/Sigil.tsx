import type { ReactElement } from 'react';

import type { EntityId } from '../contracts.ts';
import type { BoardPoints, Point } from '../hooks/useBoardPoints.ts';

export interface SigilProps {
  readonly points: BoardPoints;
  /** Closed circuits in the order they were made. */
  readonly routes: readonly { readonly callerId: EntityId; readonly destinationId: EntityId }[];
  /** Destinations nobody was routed to: the jacks the sigil seals. */
  readonly sealedDestinationIds: readonly EntityId[];
  readonly centreId: EntityId;
  /** Spoken description of the finished figure. */
  readonly label: string;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function ringPath(centre: Point, radius: number): string {
  return `M ${centre.x - radius} ${centre.y} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
}

function delay(seconds: number): Record<string, string> {
  return { ['--d']: `${seconds}s` };
}

/**
 * The ritual figure the routes were drawing all along.
 *
 * It is built from the player's own circuits: each route's midpoint becomes a
 * node of the star, the thirteenth jack is its centre, and the cords themselves
 * have pulled taut into the chords between sockets. Two rings close it, and the
 * jacks nobody was routed to are struck through as sealed.
 *
 * Strokes are drawn with a staggered stroke-dashoffset so the figure writes
 * itself in order; with motion held every stroke is simply present.
 */
export function Sigil({
  points,
  routes,
  sealedDestinationIds,
  centreId,
  label,
}: SigilProps): ReactElement | null {
  const centre = points.sockets[centreId];
  if (points.width === 0 || centre === undefined) {
    return null;
  }

  const nodes: Point[] = [];
  for (const route of routes) {
    const from = points.sockets[route.callerId];
    const to = points.sockets[route.destinationId];
    if (from !== undefined && to !== undefined) {
      nodes.push(midpoint(from, to));
    }
  }

  // The rings are centred on the figure the routes drew, not on the jack, and
  // are kept inside the board so no part of the seal is cut off.
  const hub: Point =
    nodes.length === 0
      ? centre
      : {
          x: nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length,
          y: nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length,
        };
  const reach = Math.max(0, ...nodes.map((node) => Math.hypot(node.x - hub.x, node.y - hub.y)));
  const room = Math.min(hub.x, points.width - hub.x, hub.y, points.height - hub.y) - 12;
  const outer = Math.max(40, Math.min(reach * 1.3 + 14, room));
  const inner = outer * 0.62;
  const star =
    nodes.length >= 3 ? `M ${nodes.map((node) => `${node.x} ${node.y}`).join(' L ')} Z` : '';
  // Skip-one chords make the star: the figure reads as a seal, not a polygon.
  const crossing =
    nodes.length >= 4
      ? nodes
          .map((node, index) => {
            const across = nodes[(index + 2) % nodes.length];
            return across === undefined ? '' : `M ${node.x} ${node.y} L ${across.x} ${across.y}`;
          })
          .join(' ')
      : '';

  const ticks: string[] = [];
  for (let index = 0; index < 13; index += 1) {
    const angle = (index / 13) * Math.PI * 2 - Math.PI / 2;
    const near = {
      x: hub.x + Math.cos(angle) * (outer - 7),
      y: hub.y + Math.sin(angle) * (outer - 7),
    };
    const far = {
      x: hub.x + Math.cos(angle) * (outer + 7),
      y: hub.y + Math.sin(angle) * (outer + 7),
    };
    ticks.push(`M ${near.x} ${near.y} L ${far.x} ${far.y}`);
  }

  return (
    <svg
      className="sigil"
      width={points.width}
      height={points.height}
      viewBox={`0 0 ${points.width} ${points.height}`}
      role="img"
      aria-label={label}
      focusable="false"
    >
      <path className="sigil-stroke" pathLength={1} style={delay(0.9)} d={ringPath(hub, outer)} />
      <path className="sigil-stroke" pathLength={1} style={delay(1.3)} d={ringPath(hub, inner)} />
      <path
        className="sigil-stroke sigil-stroke--ticks"
        pathLength={1}
        style={delay(1.7)}
        d={ticks.join(' ')}
      />
      {nodes.map((node, index) => (
        <path
          key={`spoke-${node.x}-${node.y}`}
          className="sigil-stroke"
          pathLength={1}
          style={delay(1.5 + index * 0.18)}
          d={`M ${centre.x} ${centre.y} L ${node.x} ${node.y}`}
        />
      ))}
      {star === '' ? null : (
        <path
          className="sigil-stroke sigil-stroke--bright"
          pathLength={1}
          style={delay(2.3)}
          d={star}
        />
      )}
      {crossing === '' ? null : (
        <path className="sigil-stroke" pathLength={1} style={delay(2.7)} d={crossing} />
      )}
      {nodes.map((node, index) => (
        <circle
          key={`node-${node.x}-${node.y}`}
          className="sigil-node"
          cx={node.x}
          cy={node.y}
          r={5}
          style={delay(2.4 + index * 0.15)}
        />
      ))}
      <circle
        className="sigil-node sigil-node--centre"
        cx={centre.x}
        cy={centre.y}
        r={9}
        style={delay(3)}
      />
      {sealedDestinationIds.map((id) => {
        const at = points.sockets[id];
        return at === undefined ? null : (
          <path
            key={`sealed-${id}`}
            className="sigil-seal"
            d={`M ${at.x - 11} ${at.y - 11} L ${at.x + 11} ${at.y + 11} M ${at.x + 11} ${at.y - 11} L ${at.x - 11} ${at.y + 11}`}
          />
        );
      })}
    </svg>
  );
}
