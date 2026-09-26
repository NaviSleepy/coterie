<script lang="ts">
  /**
   * Edits a sheet's traits in place. It only changes the draft it is given;
   * whoever holds the draft decides what saving means (a proposal for the
   * player, an adjust for the Storyteller).
   */
  import { ABILITIES, ATTRIBUTES, bloodPerTurn, bloodPoolMax, traitLabel } from '$engine/index.ts';
  import type { Draft } from '$lib/sheet-edit';

  let { draft = $bindable() }: { draft: Draft } = $props();

  const eligible = $derived(
    [...Object.entries(draft.attributes), ...Object.entries(draft.abilities)].filter(([, v]) => v >= 4).map(([k]) => k),
  );
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
</script>

<div class="editor">
  <fieldset class="grid">
    <label>Clan <input bind:value={draft.clan} /></label>
    <label>Sect <input bind:value={draft.sect} /></label>
    <label>Sire <input bind:value={draft.sire} /></label>
    <label>Generation
      <select bind:value={draft.generation}>
        {#each [13, 12, 11, 10, 9, 8, 7, 6, 5, 4] as g (g)}<option value={g}>{g}th — pool {bloodPoolMax(g)}, {bloodPerTurn(g)}/turn</option>{/each}
      </select>
    </label>
  </fieldset>

  <h3>Attributes</h3>
  <div class="cols">
    {#each Object.entries(ATTRIBUTES) as [group, keys] (group)}
      <div>
        <h4 class="label">{group}</h4>
        {#each keys as k (k)}
          <label class="trait">{traitLabel(k)}
            <input type="number" min="1" max="5" value={draft.attributes[k]}
              oninput={(e) => (draft.attributes[k] = clamp(+e.currentTarget.value, 1, 5))} />
          </label>
        {/each}
      </div>
    {/each}
  </div>

  <h3>Abilities</h3>
  <div class="cols">
    {#each Object.entries(ABILITIES) as [group, keys] (group)}
      <div>
        <h4 class="label">{group}</h4>
        {#each keys as k (k)}
          <label class="trait">{traitLabel(k)}
            <input type="number" min="0" max="5" value={draft.abilities[k]}
              oninput={(e) => (draft.abilities[k] = clamp(+e.currentTarget.value, 0, 5))} />
          </label>
        {/each}
      </div>
    {/each}
  </div>

  <h3>Specialties <span class="hint">— only for traits at four dots or more</span></h3>
  {#each draft.specialties as s, i (i)}
    <div class="row">
      <select bind:value={s.trait} aria-label="Specialty trait">
        {#each eligible.includes(s.trait) ? eligible : [s.trait, ...eligible] as k (k)}<option value={k}>{traitLabel(k)}</option>{/each}
      </select>
      <input bind:value={s.text} placeholder="Violin" aria-label="Specialty" />
      <button type="button" class="btn quiet" onclick={() => draft.specialties.splice(i, 1)}>Remove</button>
    </div>
  {/each}
  <button type="button" class="btn quiet" disabled={eligible.length === 0} onclick={() => draft.specialties.push({ trait: eligible[0], text: '' })}>Add specialty</button>

  <div class="cols two">
    <div>
      <h3>Disciplines</h3>
      {#each draft.disciplines as d, i (i)}
        <div class="row">
          <input bind:value={d.name} placeholder="Auspex" aria-label="Discipline" />
          <input type="number" min="1" max="10" bind:value={d.level} aria-label="Dots" />
          <button type="button" class="btn quiet" onclick={() => draft.disciplines.splice(i, 1)}>Remove</button>
        </div>
      {/each}
      <button type="button" class="btn quiet" onclick={() => draft.disciplines.push({ name: '', level: 1 })}>Add Discipline</button>
    </div>
    <div>
      <h3>Backgrounds</h3>
      {#each draft.backgrounds as b, i (i)}
        <div class="row">
          <input bind:value={b.name} placeholder="Resources" aria-label="Background" />
          <input type="number" min="1" max="5" bind:value={b.level} aria-label="Dots" />
          <button type="button" class="btn quiet" onclick={() => draft.backgrounds.splice(i, 1)}>Remove</button>
        </div>
      {/each}
      <button type="button" class="btn quiet" onclick={() => draft.backgrounds.push({ name: '', level: 1 })}>Add Background</button>
    </div>
    <div>
      <h3>Merits</h3>
      {#each draft.merits as m, i (i)}
        <div class="row">
          <input bind:value={m.name} placeholder="Eidetic Memory" aria-label="Merit name" />
          <input type="number" min="1" max="7" bind:value={m.points} aria-label="Merit points" />
          <button type="button" class="btn quiet" onclick={() => draft.merits.splice(i, 1)}>Remove</button>
        </div>
      {/each}
      <button type="button" class="btn quiet" onclick={() => draft.merits.push({ name: '', points: 1 })}>Add merit</button>
    </div>
    <div>
      <h3>Flaws</h3>
      {#each draft.flaws as f, i (i)}
        <div class="row">
          <input bind:value={f.name} placeholder="Nightmares" aria-label="Flaw name" />
          <input type="number" min="1" max="7" bind:value={f.points} aria-label="Flaw points" />
          <button type="button" class="btn quiet" onclick={() => draft.flaws.splice(i, 1)}>Remove</button>
        </div>
      {/each}
      <button type="button" class="btn quiet" onclick={() => draft.flaws.push({ name: '', points: 1 })}>Add flaw</button>
    </div>
  </div>

  <h3>Virtues, Path, Willpower</h3>
  <div class="grid">
    {#each Object.keys(draft.virtues) as k (k)}
      <label>{traitLabel(k)} <input type="number" min="1" max="5" bind:value={draft.virtues[k]} /></label>
    {/each}
    <label>Path <input bind:value={draft.path} /></label>
    <label>{draft.path || 'Humanity'} <input type="number" min="0" max="10" bind:value={draft.pathRating} /></label>
    <label>Willpower <input type="number" min="1" max="10" bind:value={draft.willpowerPermanent} /></label>
  </div>
</div>

<style>
  .editor {
    display: grid;
    gap: 10px;
  }
  h3 {
    font-weight: 500;
    margin: 16px 0 4px;
  }
  h4 {
    margin: 0 0 6px;
  }
  .hint {
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.9rem;
  }
  fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px 18px;
  }
  .grid label {
    display: grid;
    gap: 4px;
    font-size: 0.95rem;
    color: var(--ink-soft);
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .cols.two {
    grid-template-columns: repeat(2, 1fr);
  }
  .trait {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
  }
  .trait input {
    width: 3.5em;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .row input[type='number'] {
    width: 4em;
  }
  @media (max-width: 700px) {
    .cols,
    .cols.two {
      grid-template-columns: 1fr;
    }
  }
</style>
