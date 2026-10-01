<script lang="ts">
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { ABILITIES, ATTRIBUTES, bloodPerTurn, bloodPoolMax, traitLabel } from '$engine/index.ts';
  import type { TableState } from '$lib/table.svelte';
  import { dotMeaning, entriesOf, findEntry, gloss } from '$lib/library';

  const table = getContext<TableState>('table');

  let profile = $state({ name: '', concept: '', nature: '', demeanor: '' });
  let clan = $state('');
  let sect = $state('Camarilla');
  let sire = $state('');
  let generation = $state(13);
  let attributes = $state<Record<string, number>>(Object.fromEntries(Object.values(ATTRIBUTES).flat().map((k) => [k, 1])));
  let abilities = $state<Record<string, number>>(Object.fromEntries(Object.values(ABILITIES).flat().map((k) => [k, 0])));
  let virtues = $state<Record<string, number>>({ conscience: 1, selfControl: 1, courage: 1 });
  let path = $state('');
  let pathRating = $state(7);
  let willpowerPermanent = $state(1);
  let disciplines = $state<{ name: string; level: number }[]>([]);
  let specialties = $state<{ trait: string; text: string }[]>([]);
  let merits = $state<{ name: string; points: number }[]>([]);
  let flaws = $state<{ name: string; points: number }[]>([]);
  let busy = $state(false);

  /** Picking a merit or flaw from the table's library brings its cost with it. */
  function priced(row: { name: string; points: number }, kind: 'merit' | 'flaw') {
    const e = findEntry(table.library, kind, row.name);
    if (e?.points) row.points = e.points;
  }

  const total = (list: { name: string; points: number }[]) =>
    list.filter((m) => m.name.trim()).reduce((sum, m) => sum + m.points, 0);
  const meritPoints = $derived(total(merits));
  const flawPoints = $derived(total(flaws));

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
        clan, sect, sire, generation, attributes, abilities, virtues, path: path.trim() || 'Humanity', pathRating, willpowerPermanent,
        disciplines: disciplines.filter((d) => d.name.trim()),
        merits: merits.filter((m) => m.name.trim()),
        flaws: flaws.filter((f) => f.name.trim()),
        specialties: specialties.filter((s) => eligible.includes(s.trait)),
      },
    });
    busy = false;
    if (out) await goto(`/c/${table.chronicleId}`);
  }

  /** Paths of Enlightenment trade Conscience for Conviction and Self-Control for Instinct; the dots carry over. */
  function swapVirtue(human: string, alt: string) {
    const [from, to] = alt in virtues ? [alt, human] : [human, alt];
    virtues = Object.fromEntries(Object.entries(virtues).map(([k, v]) => [k === from ? to : k, v]));
  }

  function clampSet(map: Record<string, number>, key: string, v: number, min: number) {
    map[key] = Math.max(min, Math.min(5, v));
  }
</script>

<main class="panel">
  {#each ['clan', 'merit', 'flaw', 'discipline', 'path'] as const as kind (kind)}
    <datalist id={`lib-${kind}`}>{#each entriesOf(table.library, kind) as e (e.$id)}<option value={e.name}></option>{/each}</datalist>
  {/each}
  <h1>Bring a character to the table</h1>
  <p class="hint">Mechanical traits are checked by the server when you submit. The Storyteller can adjust them later; you can always edit your name, concept, Nature and Demeanor yourself.</p>

  <form onsubmit={(e) => { e.preventDefault(); void submit(); }}>
    <fieldset class="grid">
      <label>Name <input required bind:value={profile.name} /></label>
      <label>Concept <input bind:value={profile.concept} /></label>
      <label>Nature <input bind:value={profile.nature} /></label>
      <label>Demeanor <input bind:value={profile.demeanor} /></label>
      <label>Clan <input bind:value={clan} list="lib-clan" />{#if gloss(findEntry(table.library, 'clan', clan))}<span class="hint">{gloss(findEntry(table.library, 'clan', clan))}</span>{/if}</label>
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
            {#if dotMeaning(table.library, k, attributes[k])}<p class="hint dot">{dotMeaning(table.library, k, attributes[k])}</p>{/if}
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
            {#if dotMeaning(table.library, k, abilities[k])}<p class="hint dot">{dotMeaning(table.library, k, abilities[k])}</p>{/if}
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
        <input bind:value={d.name} placeholder="Auspex" list="lib-discipline" />
        <input type="number" min="1" max="5" bind:value={d.level} />
        <button type="button" class="btn quiet" onclick={() => (disciplines = disciplines.filter((_, j) => j !== i))}>Remove</button>
      </div>
    {/each}
    <button type="button" class="btn quiet" onclick={() => (disciplines = [...disciplines, { name: '', level: 1 }])}>Add Discipline</button>

    <h2>Merits and Flaws <span class="hint">— merits cost 1–7 freebie points, flaws give back 1–7</span></h2>
    <div class="cols two">
      <div>
        <h3 class="label">Merits</h3>
        {#each merits as m, i (i)}
          <div class="row">
            <input bind:value={m.name} placeholder="Eidetic Memory" aria-label="Merit name" list="lib-merit" oninput={() => priced(m, 'merit')} />
            <input type="number" min="1" max="7" bind:value={m.points} aria-label="Merit points" />
            <button type="button" class="btn quiet" onclick={() => (merits = merits.filter((_, j) => j !== i))}>Remove</button>
          </div>
          {#if gloss(findEntry(table.library, 'merit', m.name))}<p class="hint ref">{gloss(findEntry(table.library, 'merit', m.name))}</p>{/if}
        {/each}
        <button type="button" class="btn quiet" onclick={() => (merits = [...merits, { name: '', points: 1 }])}>Add merit</button>
      </div>
      <div>
        <h3 class="label">Flaws</h3>
        {#each flaws as f, i (i)}
          <div class="row">
            <input bind:value={f.name} placeholder="Nightmares" aria-label="Flaw name" list="lib-flaw" oninput={() => priced(f, 'flaw')} />
            <input type="number" min="1" max="7" bind:value={f.points} aria-label="Flaw points" />
            <button type="button" class="btn quiet" onclick={() => (flaws = flaws.filter((_, j) => j !== i))}>Remove</button>
          </div>
          {#if gloss(findEntry(table.library, 'flaw', f.name))}<p class="hint ref">{gloss(findEntry(table.library, 'flaw', f.name))}</p>{/if}
        {/each}
        <button type="button" class="btn quiet" onclick={() => (flaws = [...flaws, { name: '', points: 1 }])}>Add flaw</button>
      </div>
    </div>
    {#if meritPoints || flawPoints}
      <p class="hint">Merits {meritPoints} · Flaws {flawPoints} · net {meritPoints - flawPoints} freebie points{#if flawPoints > 7}. V20 allows at most 7 points of flaws; the Storyteller decides.{/if}</p>
    {/if}

    <h2>Virtues, Path, Willpower</h2>
    <div class="grid">
      {#each Object.keys(virtues) as k (k)}
        <label>{traitLabel(k)} <input type="number" min="1" max="5" bind:value={virtues[k]} /></label>
      {/each}
      <label>Path <input bind:value={path} list="lib-path" placeholder="Humanity" />{#if gloss(findEntry(table.library, 'path', path))}<span class="hint">{gloss(findEntry(table.library, 'path', path))}</span>{/if}</label>
      <label>{path.trim() || 'Humanity'} <input type="number" min="0" max="10" bind:value={pathRating} /></label>
      <label>Willpower <input type="number" min="1" max="10" bind:value={willpowerPermanent} /></label>
    </div>
    <div class="row swaps">
      <button type="button" class="btn quiet" onclick={() => swapVirtue('conscience', 'conviction')}>{'conviction' in virtues ? 'Back to Conscience' : 'Conviction instead of Conscience'}</button>
      <button type="button" class="btn quiet" onclick={() => swapVirtue('selfControl', 'instinct')}>{'instinct' in virtues ? 'Back to Self-Control' : 'Instinct instead of Self-Control'}</button>
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
  .dot {
    margin: -2px 0 6px;
    font-size: 0.85rem;
  }
  .ref {
    margin: -4px 0 8px;
  }
  .swaps {
    margin-top: 12px;
  }
  .submit {
    margin-top: 32px;
  }
  @media (max-width: 700px) {
    .cols,
    .cols.two {
      grid-template-columns: 1fr;
    }
  }
</style>
