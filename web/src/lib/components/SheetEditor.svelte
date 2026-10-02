<script lang="ts">
  /**
   * Edits a sheet's traits in place. It only changes the draft it is given;
   * whoever holds the draft decides what saving means (a proposal for the
   * player, an adjust for the Storyteller).
   */
  import { ABILITIES, ATTRIBUTES, bloodPerTurn, bloodPoolMax, traitLabel } from '$engine/index.ts';
  import type { AnyRow } from '$lib/appwrite';
  import { dotMeaning, entriesOf, findEntry, gloss, parseRitual, type LibraryKind } from '$lib/library';
  import type { Draft } from '$lib/sheet-edit';

  let {
    draft = $bindable(),
    library = {},
    storyteller = false,
  }: { draft: Draft; library?: Record<string, AnyRow>; storyteller?: boolean } = $props();
  const dhampir = $derived(draft.template === 'dhampir');

  // Datalist ids are page-global; two editors on one page mustn't share them.
  const uid = Math.random().toString(36).slice(2, 8);
  const listId = (kind: LibraryKind) => `lib-${kind}-${uid}`;
  /** Picking a merit or flaw from the library brings its cost with it. */
  function priced(row: { name: string; points: number }, kind: 'merit' | 'flaw') {
    const e = findEntry(library, kind, row.name);
    if (e?.points) row.points = e.points;
  }

  const eligible = $derived(
    [...Object.entries(draft.attributes), ...Object.entries(draft.abilities)].filter(([, v]) => v >= 4).map(([k]) => k),
  );
  /** Paths of Enlightenment trade Conscience for Conviction and Self-Control for Instinct; the dots carry over. */
  function swapVirtue(human: string, path: string) {
    const [from, to] = path in draft.virtues ? [path, human] : [human, path];
    draft.virtues = Object.fromEntries(Object.entries(draft.virtues).map(([k, v]) => [k === from ? to : k, v]));
  }
  /** Picking a ritual from the library brings its level with it. */
  function leveled(row: { name: string; level: number }) {
    const e = findEntry(library, 'ritual', row.name);
    const r = e ? parseRitual(e) : null;
    if (e) row.level = r?.level ?? 0;
  }
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
</script>

<div class="editor">
  {#each ['clan', 'merit', 'flaw', 'discipline', 'background', 'path', 'concept', 'ritual', 'title'] as const as kind (kind)}
    <datalist id={listId(kind)}>{#each entriesOf(library, kind) as e (e.$id)}<option value={e.name}></option>{/each}</datalist>
  {/each}
  <fieldset class="grid">
    {#if storyteller}
      <label>Template
        <select bind:value={draft.template}><option value="vampire">Vampire</option><option value="dhampir">Dhampir</option></select>
      </label>
    {/if}
    {#if dhampir}
      <label>Dhampir concept <input bind:value={draft.dhampirConcept} list={listId('concept')} />{#if gloss(findEntry(library, 'concept', draft.dhampirConcept))}<span class="ref">{gloss(findEntry(library, 'concept', draft.dhampirConcept))}</span>{/if}</label>
    {/if}
    <label>{dhampir ? "Antecedent's clan" : 'Clan'} <input bind:value={draft.clan} list={listId('clan')} />{#if gloss(findEntry(library, 'clan', draft.clan))}<span class="ref">{gloss(findEntry(library, 'clan', draft.clan))}</span>{/if}</label>
    <label>Sect <input bind:value={draft.sect} list={`sects-${uid}`} /></label>
    <datalist id={`sects-${uid}`}><option value="Camarilla"></option><option value="Sabbat"></option><option value="Anarch"></option><option value="Independent"></option></datalist>
    {#if storyteller}
      <label>Title <input bind:value={draft.title} list={listId('title')} placeholder="Sheriff, Bishop, Ductus…" />{#if gloss(findEntry(library, 'title', draft.title))}<span class="ref">{gloss(findEntry(library, 'title', draft.title))}</span>{/if}</label>
    {/if}
    <label>Sire <input bind:value={draft.sire} /></label>
    {#if dhampir}
      {#if storyteller}<label>Blood pool <input type="number" min="1" max="50" bind:value={draft.bloodPoolMax} /></label>{/if}
    {:else}
      <label>Generation
        <select bind:value={draft.generation}>
          {#each [13, 12, 11, 10, 9, 8, 7, 6, 5, 4] as g (g)}<option value={g}>{g}th — pool {bloodPoolMax(g)}, {bloodPerTurn(g)}/turn</option>{/each}
        </select>
      </label>
    {/if}
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
          {#if dotMeaning(library, k, draft.attributes[k])}<p class="dot">{dotMeaning(library, k, draft.attributes[k])}</p>{/if}
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
          {#if dotMeaning(library, k, draft.abilities[k])}<p class="dot">{dotMeaning(library, k, draft.abilities[k])}</p>{/if}
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
          <input bind:value={d.name} placeholder="Auspex" aria-label="Discipline" list={listId('discipline')} />
          <input type="number" min="1" max="10" bind:value={d.level} aria-label="Dots" />
          <button type="button" class="btn quiet" onclick={() => draft.disciplines.splice(i, 1)}>Remove</button>
        </div>
        {#if gloss(findEntry(library, 'discipline', d.name))}<p class="ref">{gloss(findEntry(library, 'discipline', d.name))}</p>{/if}
      {/each}
      <button type="button" class="btn quiet" onclick={() => draft.disciplines.push({ name: '', level: 1 })}>Add Discipline</button>
    </div>
    <div>
      <h3>Backgrounds</h3>
      {#each draft.backgrounds as b, i (i)}
        <div class="row">
          <input bind:value={b.name} placeholder="Resources" aria-label="Background" list={listId('background')} />
          <input type="number" min="1" max="5" bind:value={b.level} aria-label="Dots" />
          <button type="button" class="btn quiet" onclick={() => draft.backgrounds.splice(i, 1)}>Remove</button>
        </div>
        {#if gloss(findEntry(library, 'background', b.name))}<p class="ref">{gloss(findEntry(library, 'background', b.name))}</p>{/if}
      {/each}
      <button type="button" class="btn quiet" onclick={() => draft.backgrounds.push({ name: '', level: 1 })}>Add Background</button>
    </div>
    <div>
      <h3>Merits</h3>
      {#each draft.merits as m, i (i)}
        <div class="row">
          <input bind:value={m.name} placeholder="Eidetic Memory" aria-label="Merit name" list={listId('merit')} oninput={() => priced(m, 'merit')} />
          <input type="number" min="1" max="7" bind:value={m.points} aria-label="Merit points" />
          <button type="button" class="btn quiet" onclick={() => draft.merits.splice(i, 1)}>Remove</button>
        </div>
        {#if gloss(findEntry(library, 'merit', m.name))}<p class="ref">{gloss(findEntry(library, 'merit', m.name))}</p>{/if}
      {/each}
      <button type="button" class="btn quiet" onclick={() => draft.merits.push({ name: '', points: 1 })}>Add merit</button>
    </div>
    <div>
      <h3>Flaws</h3>
      {#each draft.flaws as f, i (i)}
        <div class="row">
          <input bind:value={f.name} placeholder="Nightmares" aria-label="Flaw name" list={listId('flaw')} oninput={() => priced(f, 'flaw')} />
          <input type="number" min="1" max="7" bind:value={f.points} aria-label="Flaw points" />
          <button type="button" class="btn quiet" onclick={() => draft.flaws.splice(i, 1)}>Remove</button>
        </div>
        {#if gloss(findEntry(library, 'flaw', f.name))}<p class="ref">{gloss(findEntry(library, 'flaw', f.name))}</p>{/if}
      {/each}
      <button type="button" class="btn quiet" onclick={() => draft.flaws.push({ name: '', points: 1 })}>Add flaw</button>
    </div>
  </div>

  <h3>Rituals and rites <span class="hint">— level 0 for rites without one</span></h3>
  {#each draft.rituals as r, i (i)}
    <div class="row">
      <input bind:value={r.name} placeholder="Blood Rush" aria-label="Ritual name" list={listId('ritual')} oninput={() => leveled(r)} />
      <input type="number" min="0" max="10" bind:value={r.level} aria-label="Ritual level" />
      <button type="button" class="btn quiet" onclick={() => draft.rituals.splice(i, 1)}>Remove</button>
    </div>
    {#if gloss(findEntry(library, 'ritual', r.name))}<p class="ref">{gloss(findEntry(library, 'ritual', r.name))}</p>{/if}
  {/each}
  <button type="button" class="btn quiet" onclick={() => draft.rituals.push({ name: '', level: 1 })}>Add ritual</button>

  <h3>Virtues, Path, Willpower</h3>
  <div class="grid">
    {#each Object.keys(draft.virtues) as k (k)}
      <label>{traitLabel(k)} <input type="number" min="1" max="5" bind:value={draft.virtues[k]} /></label>
    {/each}
    <label>Path <input bind:value={draft.path} list={listId('path')} placeholder="Humanity" />{#if gloss(findEntry(library, 'path', draft.path))}<span class="ref">{gloss(findEntry(library, 'path', draft.path))}</span>{/if}</label>
    <label>{draft.path || 'Humanity'} <input type="number" min="0" max="10" bind:value={draft.pathRating} /></label>
    <label>Willpower <input type="number" min="1" max="10" bind:value={draft.willpowerPermanent} /></label>
  </div>
  <div class="row">
    <button type="button" class="btn quiet" onclick={() => swapVirtue('conscience', 'conviction')}>{'conviction' in draft.virtues ? 'Back to Conscience' : 'Conviction instead of Conscience'}</button>
    <button type="button" class="btn quiet" onclick={() => swapVirtue('selfControl', 'instinct')}>{'instinct' in draft.virtues ? 'Back to Self-Control' : 'Instinct instead of Self-Control'}</button>
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
  .dot {
    margin: -2px 0 6px;
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.85rem;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .ref {
    margin: -4px 0 8px;
    color: var(--ink-soft);
    font-size: 0.9rem;
    font-style: italic;
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
