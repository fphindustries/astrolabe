import { useState } from 'react';

import { PLANET_CLASSES, withoutLinks, type PlanetClass } from '@astrolabe/rules';

import { useRollLaunchOracle } from '../api/crew.js';
import { useConfigureSector, useRollLaunchRecipe, useSaveLocation } from '../api/sector.js';
import { fieldAnchorId } from '../ui/error-summary.js';

import {
  PLANET_FIELD_LABELS,
  applyPlanetClassRoll,
  applyPlanetFieldRoll,
  applyPlanetRecipe,
  applyStarRoll,
  markStarAccepted,
  planetFieldOracle,
  setPlanetClass,
  setPlanetText,
  setStar,
  toConfigureRequest,
  toStarRequest,
  type PlanetTextField,
  type SectorForm,
  type SettlementForm,
} from './sector-form.js';
import styles from './SectorSection.module.css';

type FormUpdate = (change: (form: SectorForm) => SectorForm) => SectorForm;

/**
 * A settlement's planet, shown inside it (8.3, A33): a planet is a detail of
 * its settlement, not a place on the map (D-165). Shallow means a class and a
 * name. The starting settlement's planet is the one planet deepened, with its
 * atmosphere, what is seen from space, and a planetside feature.
 */
export function PlanetFields({
  campaignId,
  settlement,
  starting,
  update,
}: {
  readonly campaignId: string;
  readonly settlement: SettlementForm;
  readonly starting: boolean;
  readonly update: FormUpdate;
}) {
  const planet = settlement.planet;
  const draftId = settlement.draftId;
  const at = (field: string) => fieldAnchorId(`sector.settlements.${draftId}.planet.${field}`);
  const rollField = useRollLaunchOracle(campaignId);
  const rollRecipe = useRollLaunchRecipe(campaignId);
  const [rolled, setRolled] = useState<Partial<Record<string, string>>>({});
  if (planet === undefined) return null;
  const planetClass = planet.planetClass === '' ? undefined : planet.planetClass;
  const note = (key: string, text: string) => setRolled((current) => ({ ...current, [key]: text }));

  const rollClass = () =>
    rollRecipe.mutate(
      { kind: 'planet_class' },
      {
        onSuccess: (response) => {
          const result = response.results[0];
          if (result === undefined) return;
          note('class', `${result.roll}: ${withoutLinks(result.text)}`);
          update((current) => applyPlanetClassRoll(current, draftId, result));
        },
      },
    );

  const rollOne = (field: PlanetTextField) => {
    if (planetClass === undefined) return;
    rollField.mutate(planetFieldOracle(planetClass, field), {
      onSuccess: (result) => {
        note(field, `${result.roll}: ${result.text}`);
        update((current) =>
          applyPlanetFieldRoll(current, draftId, field, {
            eventId: result.eventId,
            text: result.text,
          }),
        );
      },
    });
  };

  const rollDetail = () => {
    if (planetClass === undefined) return;
    rollRecipe.mutate(
      { kind: 'planet', planetClass, depth: 'starting_detail' },
      {
        onSuccess: (response) =>
          update((current) => applyPlanetRecipe(current, draftId, response.results)),
      },
    );
  };

  const fields: readonly PlanetTextField[] = starting
    ? ['name', 'atmosphere', 'observedFromSpace', 'feature']
    : ['name'];

  return (
    <fieldset className={styles.quirks} id={at('class')}>
      <legend className={styles.label}>Its planet</legend>
      <p className={styles.help}>
        {starting
          ? 'The starting settlement’s planet gets the fuller detail. Every other planet stays shallow.'
          : 'A class and a name is all a planet needs for now. The starting settlement’s planet gets more.'}
      </p>
      <div className={styles.row}>
        <label className={styles.subLabel} htmlFor={at('class-select')}>
          Class
        </label>
        <select
          id={at('class-select')}
          className={styles.input}
          value={planet.planetClass}
          onChange={(event) =>
            update((current) => setPlanetClass(current, draftId, event.target.value as PlanetClass))
          }
        >
          <option value="" disabled>
            Choose a class
          </option>
          {PLANET_CLASSES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate[0]!.toUpperCase() + candidate.slice(1)} world
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.secondary}
          disabled={rollRecipe.isPending}
          aria-label="Roll the planet’s class"
          onClick={rollClass}
        >
          Roll
        </button>
      </div>
      {rolled['class'] !== undefined && <p className={styles.rolled}>Rolled {rolled['class']}</p>}

      {fields.map((field) => (
        <div key={field} className={styles.field}>
          <label className={styles.subLabel} htmlFor={at(field)}>
            {PLANET_FIELD_LABELS[field]}
          </label>
          <div className={styles.row}>
            <input
              id={at(field)}
              className={styles.input}
              value={planet[field]}
              onChange={(event) =>
                update((current) => setPlanetText(current, draftId, field, event.target.value))
              }
            />
            <button
              type="button"
              className={styles.secondary}
              disabled={rollField.isPending || planetClass === undefined}
              aria-label={`Roll the planet’s ${PLANET_FIELD_LABELS[field].toLowerCase()}`}
              onClick={() => rollOne(field)}
            >
              Roll
            </button>
          </div>
          {rolled[field] !== undefined && <p className={styles.rolled}>Rolled {rolled[field]}</p>}
        </div>
      ))}
      {planetClass === undefined && (
        <p className={styles.help}>
          Choose or roll the class first: each class has its own tables.
        </p>
      )}
      {starting && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={rollRecipe.isPending || planetClass === undefined}
            onClick={rollDetail}
          >
            Roll the starting detail
          </button>
        </div>
      )}
    </fieldset>
  );
}

/**
 * The sector's optional star (8.3, D-195). It belongs to the sector and is
 * shown with it, not placed on the map. Accepting it adds the star, then
 * names it on the sector: two commands, because the star must exist before
 * the sector can name it.
 */
export function StarFields({
  campaignId,
  form,
  update,
  configured,
}: {
  readonly campaignId: string;
  readonly form: SectorForm;
  readonly update: FormUpdate;
  readonly configured: boolean;
}) {
  const roll = useRollLaunchRecipe(campaignId);
  const save = useSaveLocation(campaignId);
  const configure = useConfigureSector(campaignId);
  const [rolled, setRolled] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const failure = save.error ?? configure.error ?? roll.error;
  const at = (field: string) => fieldAnchorId(`sector.star.${field}`);

  const accept = () => {
    const request = toStarRequest(form.star);
    if (request === null) return;
    save.mutate(request, {
      onSuccess: (response) => {
        const next = update((current) => markStarAccepted(current, response.locationId));
        const sector = toConfigureRequest(next);
        if (sector !== null)
          configure.mutate(sector, { onSuccess: () => setSaved('The sector’s star is accepted.') });
      },
    });
  };

  return (
    <fieldset className={styles.quirks}>
      <legend className={styles.label}>Its star (optional)</legend>
      <p className={styles.help}>
        A sector may have a star you name. It is shown with the sector, not on the map.
      </p>
      {failure !== null && failure !== undefined && (
        <p className={styles.unavailable} role="alert">
          {failure.message}
        </p>
      )}
      <div className={styles.field}>
        <label className={styles.subLabel} htmlFor={at('name')}>
          Name
        </label>
        <input
          id={at('name')}
          className={styles.input}
          value={form.star.name}
          onChange={(event) => update((current) => setStar(current, 'name', event.target.value))}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.subLabel} htmlFor={at('description')}>
          What it is
        </label>
        <div className={styles.row}>
          <input
            id={at('description')}
            className={styles.input}
            value={form.star.description}
            onChange={(event) =>
              update((current) => setStar(current, 'description', event.target.value))
            }
          />
          <button
            type="button"
            className={styles.secondary}
            disabled={roll.isPending}
            aria-label="Roll the star"
            onClick={() =>
              roll.mutate(
                { kind: 'star' },
                {
                  onSuccess: (response) => {
                    const result = response.results[0];
                    if (result === undefined) return;
                    setRolled(`${result.roll}: ${result.text}`);
                    update((current) => applyStarRoll(current, result));
                  },
                },
              )
            }
          >
            Roll
          </button>
        </div>
        {rolled !== undefined && <p className={styles.rolled}>Rolled {rolled}</p>}
      </div>
      {saved !== undefined && (
        <p className={styles.saved} role="status">
          {saved}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={!configured || save.isPending || toStarRequest(form.star) === null}
          onClick={accept}
        >
          {form.star.locationId === undefined ? 'Accept the star' : 'Save the star'}
        </button>
      </div>
    </fieldset>
  );
}
