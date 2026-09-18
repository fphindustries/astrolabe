import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import type { LaunchWorkspaceResponse } from '@astrolabe/shared';

import { useRemoveRoute, useSaveRoute, useSetLayout, type RouteEndpoint } from '../api/sector.js';

import {
  MAP_HEIGHT,
  MAP_WIDTH,
  exitPoint,
  isLayoutDirty,
  layoutToSave,
  mapNodes,
  passageViews,
  step,
  toMapPoint,
  type Layout,
  type MapNode,
} from './sector-map.js';
import styles from './SectorSection.module.css';

const OFF_MAP = '__off_map__';

/**
 * The sector map and its passages (8.4, beat 8, A34, D-197).
 *
 * Hand-rolled SVG. Nodes move by pointer and by arrow keys; positions stay
 * here until **Save the layout** writes them once, never per pointer move.
 * The list beside it does everything the map does — add, inspect and remove
 * every passage and exit — so nothing requires dragging or seeing the map.
 */
export function SectorMap({
  campaignId,
  workspace,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
}) {
  const state = workspace.state;
  const [local, setLocal] = useState<Layout>({});
  const [dragging, setDragging] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const setLayout = useSetLayout(campaignId);

  const nodes = mapNodes(state, local);
  const byId = new Map<string, MapNode>(nodes.map((node) => [node.id, node]));
  const passages = passageViews(state);
  const dirty = isLayoutDirty(state, nodes);

  const moveTo = (node: MapNode, x: number, y: number) => {
    setSaved(undefined);
    setLocal((current) => ({ ...current, [node.id]: { x, y } }));
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (dragging === undefined || svg.current === null) return;
    const node = byId.get(dragging);
    if (node === undefined) return;
    const at = toMapPoint(
      { x: event.clientX, y: event.clientY },
      svg.current.getBoundingClientRect(),
    );
    moveTo(node, at.x, at.y);
  };

  const onKey = (node: MapNode, event: KeyboardEvent<SVGGElement>) => {
    const next = step(node, event.key);
    if (next === undefined) return;
    event.preventDefault();
    moveTo(node, next.x, next.y);
  };

  const saveLayout = () =>
    setLayout.mutate(layoutToSave(nodes), {
      onSuccess: () => {
        setLocal({});
        setSaved('Layout saved. It changes nothing about distance or travel.');
      },
    });

  return (
    <section className={styles.block} aria-labelledby="sector-map-heading">
      <h3 className={styles.blockHeading} id="sector-map-heading">
        Map and passages
      </h3>
      <p className={styles.help}>
        Arrange the places however reads best. Where a place sits on this map means nothing for
        distance, travel time or any rule; only the passages connect them.
      </p>

      {nodes.length === 0 ? (
        <p className={styles.help}>Accepted settlements and locations appear here.</p>
      ) : (
        <svg
          ref={svg}
          className={styles.map}
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="group"
          aria-label="Sector map. Each place can be focused and moved with the arrow keys."
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(undefined)}
          onPointerLeave={() => setDragging(undefined)}
        >
          {passages.map((passage) => {
            const from = byId.get(passage.from);
            if (from === undefined) return null;
            const to = typeof passage.to === 'string' ? byId.get(passage.to) : exitPoint(from);
            if (to === undefined) return null;
            const exit = typeof passage.to !== 'string';
            return (
              <g key={passage.key} aria-hidden="true">
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={exit ? styles.mapExit : styles.mapPassage}
                />
                {exit && typeof passage.to !== 'string' && (
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 8}
                    className={styles.mapExitLabel}
                    textAnchor="middle"
                  >
                    {passage.to.label} →
                  </text>
                )}
              </g>
            );
          })}
          {nodes.map((node) => (
            <g
              key={node.id}
              tabIndex={0}
              role="button"
              aria-label={`${node.name}${node.starting ? ', the starting settlement' : ''}. Use the arrow keys to move it.`}
              className={styles.mapNode}
              transform={`translate(${node.x} ${node.y})`}
              onPointerDown={(event) => {
                // Focus follows the pointer, so the arrow keys move what was just touched.
                event.currentTarget.focus();
                (event.currentTarget.ownerSVGElement ?? event.currentTarget).setPointerCapture?.(
                  event.pointerId,
                );
                setDragging(node.id);
              }}
              onKeyDown={(event) => onKey(node, event)}
            >
              {node.kind === 'settlement' ? (
                <circle r={node.starting ? 16 : 12} className={styles.mapSettlement} />
              ) : (
                <rect x={-11} y={-11} width={22} height={22} className={styles.mapOther} />
              )}
              <text y={34} textAnchor="middle" className={styles.mapLabel}>
                {node.name}
                {node.starting ? ' (start)' : ''}
              </text>
            </g>
          ))}
        </svg>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={!dirty || setLayout.isPending || nodes.length === 0}
          onClick={saveLayout}
        >
          Save the layout
        </button>
        <span className={styles.note} role="status">
          {saved ?? (dirty && nodes.length > 0 ? 'The layout has changes that are not saved.' : '')}
        </span>
      </div>

      <PassageList campaignId={campaignId} workspace={workspace} nodes={nodes} />
    </section>
  );
}

/**
 * Every passage in words, and the controls to add and remove them without the
 * map (A34). A passage is undirected: the server treats one stated either way
 * round as the same passage (D-174).
 */
function PassageList({
  campaignId,
  workspace,
  nodes,
}: {
  readonly campaignId: string;
  readonly workspace: LaunchWorkspaceResponse;
  readonly nodes: readonly MapNode[];
}) {
  const passages = passageViews(workspace.state);
  const add = useSaveRoute(campaignId);
  const remove = useRemoveRoute(campaignId);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const failure = add.error ?? remove.error;

  const target: RouteEndpoint | undefined =
    to === OFF_MAP
      ? label.trim() === ''
        ? undefined
        : { kind: 'off_map', label: label.trim() }
      : to === ''
        ? undefined
        : to;
  const canAdd = from !== '' && target !== undefined && from !== to;

  return (
    <div className={styles.group}>
      <h4 className={styles.label}>Passages</h4>
      {failure !== null && failure !== undefined && (
        <p className={styles.unavailable} role="alert">
          {failure.message}
        </p>
      )}
      {passages.length === 0 ? (
        <p className={styles.help}>No passages yet.</p>
      ) : (
        <ul className={styles.roster}>
          {passages.map((passage) => (
            <li key={passage.key} className={styles.rosterRow}>
              <span>{passage.text}</span>
              <span className={styles.row}>
                <label className={styles.subLabel} htmlFor={`reason-${passage.key}`}>
                  Why remove it?
                </label>
                <input
                  id={`reason-${passage.key}`}
                  className={styles.input}
                  value={reasons[passage.key] ?? ''}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [passage.key]: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={(reasons[passage.key] ?? '').trim() === '' || remove.isPending}
                  aria-label={`Remove the passage ${passage.text}`}
                  onClick={() =>
                    remove.mutate({
                      route: { from: passage.from, to: passage.to },
                      reason: reasons[passage.key] ?? '',
                    })
                  }
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <fieldset className={styles.quirks}>
        <legend className={styles.label}>Add a passage</legend>
        <div className={styles.pair}>
          <label className={styles.subLabel} htmlFor="passage-from">
            From
          </label>
          <select
            id="passage-from"
            className={styles.input}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          >
            <option value="">Choose a place</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
          <label className={styles.subLabel} htmlFor="passage-to">
            To
          </label>
          <select
            id="passage-to"
            className={styles.input}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          >
            <option value="">Choose a place</option>
            {nodes
              .filter((node) => node.id !== from)
              .map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            <option value={OFF_MAP}>An exit off the map</option>
          </select>
        </div>
        {to === OFF_MAP && (
          <div className={styles.field}>
            <label className={styles.subLabel} htmlFor="passage-label">
              Where the exit leads
            </label>
            <input
              id="passage-label"
              className={styles.input}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={!canAdd || add.isPending}
            onClick={() => {
              if (target === undefined) return;
              add.mutate(
                { from, to: target },
                {
                  onSuccess: () => {
                    setTo('');
                    setLabel('');
                  },
                },
              );
            }}
          >
            Add the passage
          </button>
        </div>
      </fieldset>
    </div>
  );
}
