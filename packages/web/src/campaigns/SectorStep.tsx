import { useState, type FormEvent } from 'react';

import { useCampaignState } from '../api/campaigns.js';
import { useAddSectorLocation, useAddSectorRoute } from '../api/campaign-setup.js';

import { sectorLocations, sectorRouteViews } from './campaign-setup.js';
import styles from './SectorStep.module.css';

/**
 * The sector as a location list with routes (task 4.3, D-32, D-102). Player
 * writes each location's name and description directly — oracle-grounded
 * generation waits for the oracle-recipe API (task 8.1) and the AI provider
 * (group 7), neither of which exists yet.
 */
export function SectorStep({
  campaignId,
  onNext,
}: {
  readonly campaignId: string;
  readonly onNext: () => void;
}) {
  const { data: state } = useCampaignState(campaignId);
  const locations = state === undefined ? [] : sectorLocations(state);
  const routes = state === undefined ? [] : sectorRouteViews(state);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const addLocation = useAddSectorLocation(campaignId);

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const addRoute = useAddSectorRoute(campaignId);

  const submitLocation = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length === 0) return;
    addLocation.mutate(
      { name, description },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
        },
      },
    );
  };

  const submitRoute = (event: FormEvent) => {
    event.preventDefault();
    if (fromId === '' || toId === '' || fromId === toId) return;
    addRoute.mutate({ fromLocationId: fromId, toLocationId: toId });
  };

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.title}>Locations</h2>
        <form className={styles.row} onSubmit={submitLocation}>
          <input
            className={styles.input}
            placeholder="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            className={styles.input}
            placeholder="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <button type="submit" className={styles.button}>
            Add
          </button>
        </form>
        <ul className={styles.list}>
          {locations.map((location) => (
            <li key={location.id}>{location.name}</li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.title}>Routes</h2>
        <form className={styles.row} onSubmit={submitRoute}>
          <select
            className={styles.select}
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
          >
            <option value="">From…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select className={styles.select} value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">To…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.button} disabled={locations.length < 2}>
            Connect
          </button>
        </form>
        <ul className={styles.list}>
          {routes.map((route, index) => (
            <li key={index}>
              {route.from} ↔ {route.to}
            </li>
          ))}
        </ul>
      </section>

      <button type="button" className={styles.next} onClick={onNext}>
        Next: the inciting incident
      </button>
    </div>
  );
}
