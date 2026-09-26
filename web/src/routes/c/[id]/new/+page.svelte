<script lang="ts">
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { ABILITIES, ATTRIBUTES, bloodPerTurn, bloodPoolMax, traitLabel } from '$engine/index.ts';
  import type { TableState } from '$lib/table.svelte';

  const table = getContext<TableState>('table');

  let profile = $state({ name: '', concept: '', nature: '', demeanor: '' });
  let clan = $state('');
  let sect = $state('Camarilla');
  let sire = $state('');
  let generation = $state(13);
  let attributes = $state<Record<string, number>>(Object.fromEntries(Object.values(ATTRIBUTES).flat().map((k) => [k, 1])));
  let abilities = $state<Record<string, number>>(Object.fromEntries(Object.values(ABILITIES).flat().map((k) => [k, 0])));
  let virtues = $state({ conscience: 1, selfControl: 1, courage: 1 });
  let pathRating = $state(7);
  let willpowerPermanent = $state(1);
  let disciplines = $state<{ name: string; level: number }[]>([]);
  let specialties = $state<{ trait: string; text: string }[]>([]);
  let busy = $state(false);

  const eligible = $derived(
    [...Object.entries(attributes), ...Object.entries(abilities)].filter(([, v]) => v >= 4).map(([k]) => k),
  );

  async function submit() {
    busy = true;
    const out = await table.act('character', {
      action: 'create',
      chronicleId: table.chronicleId,
      profile,
      sheet: {
        clan, sect, sire, generation, attributes, abilities, virtues, pathRating, willpowerPermanent,
        disciplines: disciplines.filter((d) => d.name.trim()),
        specialties: specialties.filter((s) => eligible.includes(s.trait)),
      },
    });
    busy = false;
    if (out) await goto(`/c/${table.chronicleId}`);
  }

  function clampSet(map: Record<string, number>, key: string, v: number, min: number) {
    map[key] = Math.max(min, Math.min(5, v));
  }
</script>

<main class="panel">
  <h1>Bring a character to the table</h1>
  <p class="hint">Mechanical traits are checked by the server when you submit. The Storyteller can adjust them later; you can always edit your profile and add a character portrait after taking your seat.</p>

  <form onsubmit={(e) => { e.preventDefault(); void submit(); }}>
    <fieldset class="grid">
      <label>Name <input required bind:value={profile.name} /></label>
      <label>Concept <input bind:value={profile.concept} /></label>
      <label>Nature <input bind:value={profile.nature} /></label>
      <label>Demeanor <input bind:value={profile.demeanor} /></label>
      <label>Clan <input bind:value={clan} /></label>
      <label>Sect <input bind:value={sect} /></label>
      <label>Sire <input bind:value={sire} /></label>
      <label>Generation
        <select bind:value={generation}>
          {#each [13, 12, 11, 10, 9, 8, 7, 6, 5, 4] as g (g)}<option value={g}>{g}th — pool {bloodPoolMax(g)}, {bloodPerTurn(g)}/turn</option>{/each}
        </select>
      </label>
    </fieldset>

    <h2>Attributes</h2>
    <div class="cols">
      {#each Object.entries(ATTRIBUTES) as [group, keys] (group)}
        <div>
          <h3 class="label">{group}</h3>
          {#each keys as k (k)}
            <label class="trait">{traitLabel(k)}
              <input type="number" min="1" max="5" value={attributes[k]} oninput={(e) => clampSet(attributes, k, +e.currentTarget.value, 1)} />
            </label>
          {/each}
        </div>
      {/each}
    </div>

    <h2>Abilities</h2>
    <div class="cols">
      {#each Object.entries(ABILITIES) as [group, keys] (group)}
        <div>
          <h3 class="label">{group}</h3>
          {#each keys as k (k)}
            <label class="trait">{traitLabel(k)}
              <input type="number" min="0" max="5" value={abilities[k]} oninput={(e) => clampSet(abilities, k, +e.currentTarget.value, 0)} />
            </label>
          {/each}
        </div>
      {/each}
    </div>

    <h2>Specialties <span class="hint">— only for traits at four dots or more</span></h2>
    {#each specialties as s, i (i)}
      <div class="row">
        <select bind:value={s.trait}>{#each eligible as k (k)}<option value={k}>{traitLabel(k)}</option>{/each}</select>
        <input bind:value={s.text} placeholder="Violin" />
        <button type="button" class="btn quiet" onclick={() => (specialties = specialties.filter((_, j) => j !== i))}>Remove</button>
      </div>
    {/each}
    <button type="button" class="btn quiet" disabled={eligible.length === 0} onclick={() => (specialties = [...specialties, { trait: eligible[0], text: '' }])}>Add specialty</button>

    <h2>Disciplines</h2>
    {#each disciplines as d, i (i)}
      <div class="row">
        <input bind:value={d.name} placeholder="Auspex" />
        <input type="number" min="1" max="5" bind:value={d.level} />
        <button type="button" class="btn quiet" onclick={() => (disciplines = disciplines.filter((_, j) => j !== i))}>Remove</button>
      </div>
    {/each}
    <button type="button" class="btn quiet" onclick={() => (disciplines = [...disciplines, { name: '', level: 1 }])}>Add Discipline</button>

    <h2>Virtues, Path, Willpower</h2>
    <div class="grid">
      <label>Conscience <input type="number" min="1" max="5" bind:value={virtues.conscience} /></label>
      <label>Self-Control <input type="number" min="1" max="5" bind:value={virtues.selfControl} /></label>
      <label>Courage <input type="number" min="1" max="5" bind:value={virtues.courage} /></label>
      <label>Humanity <input type="number" min="0" max="10" bind:value={pathRating} /></label>
      <label>Willpower <input type="number" min="1" max="10" bind:value={willpowerPermanent} /></label>
    </div>

    <button class="btn solid submit" disabled={busy || !profile.name.trim()}>{busy ? 'Rolling starting blood…' : 'Take a seat'}</button>
  </form>
</main>

<style>
  main {
    max-width: 980px;
    margin: 32px auto;
  }
  h1 {
    font-weight: 500;
    margin: 0 0 8px;
  }
  h2 {
    font-weight: 500;
    margin: 28px 0 10px;
  }
  h3 {
    margin: 0 0 6px;
  }
  .hint {
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.95rem;
  }
  fieldset {
    border: none;
    padding: 0;
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px 20px;
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
    gap: 24px;
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
  .submit {
    margin-top: 32px;
  }
  @media (max-width: 700px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
</style>
