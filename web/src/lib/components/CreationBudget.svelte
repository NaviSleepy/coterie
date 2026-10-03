<script lang="ts">
  /**
   * The Storyteller sets this campaign's creation budget: priorities, free
   * dots, freebies, limits and freebie prices, per template. Only what
   * differs from the book is saved, so "V20 as written" stays a clean
   * default. The server holds players to whatever is saved here.
   */
  import { CREATION_LIMITS, CREATION_RULES, rulesFor, type CreationOverrides, type CreationRules, type Template } from '$engine/index.ts';
  import { parseJson } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';

  let { table }: { table: TableState } = $props();

  const saved = $derived(parseJson<CreationOverrides>(table.chronicle?.creationRules, {}));
  let template = $state<Template>('vampire');
  let draft = $state<Record<Template, CreationRules>>({ vampire: rulesFor('vampire'), dhampir: rulesFor('dhampir') });
  let editing = $state(false);
  let flash = $state('');

  function edit() {
    draft = { vampire: rulesFor('vampire', saved), dhampir: rulesFor('dhampir', saved) };
    editing = true;
  }

  /** Only the numbers that differ from the book. */
  function diff(t: Template, r: CreationRules) {
    const book = CREATION_RULES[t];
    const out: Record<string, unknown> = {};
    for (const key of ['attributes', 'abilities'] as const) if (r[key].join() !== book[key].join()) out[key] = r[key].map(Number);
    for (const key of ['abilityCap', 'disciplines', 'backgrounds', 'virtues', 'freebies', 'maxFlaws', 'maxMerits', 'maxGeneration'] as const) {
      if (Number(r[key]) !== book[key]) out[key] = Number(r[key]);
    }
    const cost: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.cost)) if (Number(v) !== book.cost[k as keyof typeof book.cost]) cost[k] = Number(v);
    if (Object.keys(cost).length) out.cost = cost;
    return out;
  }

  async function save(rules: CreationOverrides | Record<string, never>) {
    const ok = await table.act('chronicle', { action: 'update', chronicleId: table.chronicleId, creationRules: rules });
    if (ok) {
      editing = false;
      flash = 'Saved. New characters are held to it from now on.';
      setTimeout(() => (flash = ''), 4000);
    }
  }

  function saveDraft() {
    const out: Record<string, unknown> = {};
    for (const t of ['vampire', 'dhampir'] as const) {
      const d = diff(t, draft[t]);
      if (Object.keys(d).length) out[t] = d;
    }
    void save(out as CreationOverrides);
  }

  /** The changes in words, for the closed panel. */
  function summary(t: Template): string {
    const o = saved[t];
    if (!o || !Object.keys(o).length) return 'V20 as written';
    const parts: string[] = [];
    if (o.attributes) parts.push(`Attributes ${o.attributes.join('/')}`);
    if (o.abilities) parts.push(`Abilities ${o.abilities.join('/')}`);
    if (o.disciplines !== undefined) parts.push(`${o.disciplines} Disciplines`);
    if (o.backgrounds !== undefined) parts.push(`${o.backgrounds} Backgrounds`);
    if (o.virtues !== undefined) parts.push(`${o.virtues} Virtues`);
    if (o.freebies !== undefined) parts.push(`${o.freebies} freebies`);
    if (o.abilityCap !== undefined) parts.push(`Abilities up to ${o.abilityCap}`);
    if (o.maxGeneration !== undefined) parts.push(`up to ${o.maxGeneration} Generation dots`);
    if (o.maxFlaws !== undefined) parts.push(`flaws refund up to ${o.maxFlaws}`);
    if (o.maxMerits !== undefined) parts.push(`merits up to ${o.maxMerits}`);
    if (o.cost) parts.push('custom freebie prices');
    return parts.join(', ');
  }

  const FIELDS = [
    ['disciplines', 'Discipline dots'],
    ['backgrounds', 'Background dots'],
    ['virtues', 'Virtue dots'],
    ['freebies', 'Freebie points'],
    ['abilityCap', 'Highest Ability before freebies'],
    ['maxGeneration', 'Most Generation dots'],
    ['maxFlaws', 'Flaw points that refund'],
    ['maxMerits', 'Most merit points'],
  ] as const;
  const COSTS = [
    ['attribute', 'Attribute'],
    ['ability', 'Ability'],
    ['discipline', 'Discipline'],
    ['background', 'Background'],
    ['virtue', 'Virtue'],
    ['path', 'Humanity or Path'],
    ['willpower', 'Willpower'],
  ] as const;
</script>

<section class="budget panel" aria-label="Creation budget">
  <header>
    <h2>Creation budget</h2>
    {#if !editing}<button class="btn quiet" onclick={edit}>Change</button>{/if}
  </header>
  {#if !editing}
    <p><span class="label">Vampires</span> {summary('vampire')}</p>
    <p><span class="label">Dhampirs</span> {summary('dhampir')}</p>
    <p class="hint">Players can't take a seat over it without your approval.</p>
    {#if flash}<p class="flash">{flash}</p>{/if}
  {:else}
    <div class="tabs" role="tablist">
      {#each ['vampire', 'dhampir'] as const as t (t)}
        <button role="tab" aria-selected={template === t} class="btn" class:quiet={template !== t} onclick={() => (template = t)}>{t === 'vampire' ? 'Vampires' : 'Dhampirs'}</button>
      {/each}
    </div>
    {@const r = draft[template]}
    <div class="grid">
      <fieldset>
        <legend>Attributes (primary / secondary / tertiary)</legend>
        {#each [0, 1, 2] as i (i)}<input type="number" min={CREATION_LIMITS.attributes[0]} max={CREATION_LIMITS.attributes[1]} bind:value={r.attributes[i]} aria-label={`Attribute priority ${i + 1}`} />{/each}
      </fieldset>
      <fieldset>
        <legend>Abilities (primary / secondary / tertiary)</legend>
        {#each [0, 1, 2] as i (i)}<input type="number" min={CREATION_LIMITS.abilities[0]} max={CREATION_LIMITS.abilities[1]} bind:value={r.abilities[i]} aria-label={`Ability priority ${i + 1}`} />{/each}
      </fieldset>
      {#each FIELDS as [key, label] (key)}
        {#if key !== 'maxGeneration' || template === 'vampire'}
          <label>{label} <input type="number" min={CREATION_LIMITS[key][0]} max={CREATION_LIMITS[key][1]} bind:value={r[key]} /></label>
        {/if}
      {/each}
    </div>
    <h3 class="label">Freebie prices, per dot</h3>
    <div class="grid costs">
      {#each COSTS as [key, label] (key)}
        <label>{label} <input type="number" min="0" max="20" bind:value={r.cost[key]} /></label>
      {/each}
    </div>
    <div class="row">
      <button class="btn solid" onclick={saveDraft}>Save</button>
      <button class="btn quiet" onclick={() => (draft[template] = rulesFor(template))}>Book numbers for {template === 'vampire' ? 'vampires' : 'dhampirs'}</button>
      <button class="btn quiet" onclick={() => save({})}>Reset all to V20</button>
      <button class="btn quiet" onclick={() => (editing = false)}>Cancel</button>
    </div>
    <p class="hint">Changes apply to characters created from now on. Sheets already at the table don't change, and approving a waiting request always creates it as it was sent.</p>
  {/if}
</section>

<style>
  .budget {
    display: grid;
    gap: 8px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h2 {
    font-weight: 500;
    margin: 0;
  }
  p {
    margin: 0;
  }
  .label {
    margin-right: 0.5em;
  }
  .hint,
  .flash {
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.9rem;
  }
  .tabs,
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px 16px;
  }
  fieldset {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    grid-column: span 2;
  }
  legend {
    font-size: 0.9rem;
    color: var(--ink-soft);
    margin-bottom: 4px;
  }
  fieldset input {
    width: 4.5em;
  }
  label {
    display: grid;
    gap: 3px;
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  h3 {
    margin: 6px 0 0;
  }
</style>
