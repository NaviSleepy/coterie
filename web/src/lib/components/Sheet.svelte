<script lang="ts">
  import { ABILITIES, ATTRIBUTES, traitLabel, woundPenalty } from '$engine/index.ts';
  import { DATABASE_ID } from '$schema';
  import { healthOf, type Character } from '$shared/codec.ts';
  import { tables } from '$lib/appwrite';
  import type { TableState } from '$lib/table.svelte';
  import { dotLadder, dotMeaning, findEntry, gloss } from '$lib/library';
  import Dots from './Dots.svelte';
  import HealthTrack from './HealthTrack.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();
  /** The trait whose dot meaning is open, for screens with no hover. */
  let opened = $state<string | null>(null);
  const toggle = (key: string) => (opened = opened === key ? null : key);

  const profile = $derived(table.profiles[character.$id] ?? {});
  const penalty = $derived(woundPenalty(healthOf(character)));
  const specialty = (trait: string) => character.specialties.find((s) => s.trait === trait)?.text;
  const isOwner = $derived(character.ownerId === table.me);

  let editing = $state(false);
  let draft = $state({ name: '', concept: '', nature: '', demeanor: '' });
  let saveError = $state<string | null>(null);

  function edit() {
    draft = {
      name: profile.name ?? '',
      concept: profile.concept ?? '',
      nature: profile.nature ?? '',
      demeanor: profile.demeanor ?? '',
    };
    editing = true;
  }

  // Cosmetic fields are the one thing a player writes directly — to the
  // profiles row, which is all their permissions reach.
  async function save() {
    saveError = null;
    try {
      await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'profiles', rowId: character.$id, data: draft });
      editing = false;
    } catch (e) {
      saveError = (e as Error).message;
    }
  }

  const ABILITY_GROUPS = [
    ['Talents', ABILITIES.talents],
    ['Skills', ABILITIES.skills],
    ['Knowledges', ABILITIES.knowledges],
  ] as const;
  const ATTRIBUTE_GROUPS = [
    ['Physical', ATTRIBUTES.physical],
    ['Social', ATTRIBUTES.social],
    ['Mental', ATTRIBUTES.mental],
  ] as const;
  const virtueKeys = $derived(Object.keys(character.virtues));
</script>

<article class="sheet panel">
  <header>
    <div>
      {#if editing}
        <input class="name-input" bind:value={draft.name} aria-label="Name" />
      {:else}
        <h1>{profile.name ?? 'Unnamed'}</h1>
      {/if}
      <p class="lineage caps">
        {[character.clan, `${ordinal(character.generation)} Generation`, character.sect].filter(Boolean).join(' · ')}
      </p>
    </div>
    <dl class="meta">
      {#if editing}
        <label><span>Nature</span><input bind:value={draft.nature} /></label>
        <label><span>Demeanor</span><input bind:value={draft.demeanor} /></label>
        <label class="wide"><span>Concept</span><input bind:value={draft.concept} /></label>
      {:else}
        <div><dt>Nature</dt><dd>{profile.nature || '—'}</dd></div>
        <div><dt>Demeanor</dt><dd>{profile.demeanor || '—'}</dd></div>
        <div><dt>Sire</dt><dd>{character.sire || '—'}</dd></div>
        <div><dt>Concept</dt><dd>{profile.concept || '—'}</dd></div>
      {/if}
    </dl>
    {#if isOwner}
      <div class="edit">
        {#if editing}
          <button class="btn quiet" onclick={() => (editing = false)}>Cancel</button>
          <button class="btn" onclick={save}>Save</button>
        {:else}
          <button class="linkish" onclick={edit}>Edit profile</button>
        {/if}
        {#if saveError}<span class="error">{saveError}</span>{/if}
      </div>
    {/if}
  </header>

  <section>
    <h2>Attributes</h2>
    <div class="cols">
      {#each ATTRIBUTE_GROUPS as [title, keys] (title)}
        <div>
          <h3 class="label">{title}</h3>
          {#each keys as key (key)}
            {@const meaning = dotMeaning(table.library, key, character.attributes[key] ?? 1)}
            <button type="button" class="trait plain" disabled={!meaning} aria-expanded={opened === key} onclick={() => toggle(key)} title={dotLadder(table.library, key, character.attributes[key] ?? 1) || undefined}><span>{traitLabel(key)}</span><Dots value={character.attributes[key] ?? 1} label={traitLabel(key)} /></button>
            {#if opened === key && meaning}<p class="meaning">{meaning}</p>{/if}
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Abilities</h2>
    <div class="cols">
      {#each ABILITY_GROUPS as [title, keys] (title)}
        {@const trained = keys.filter((k) => (character.abilities[k] ?? 0) > 0)}
        <div>
          <h3 class="label">{title}</h3>
          {#each trained as key (key)}
            {@const meaning = dotMeaning(table.library, key, character.abilities[key])}
            <button type="button" class="trait plain" disabled={!meaning} aria-expanded={opened === key} onclick={() => toggle(key)} title={dotLadder(table.library, key, character.abilities[key]) || undefined}>
              <span>{traitLabel(key)}{#if specialty(key)}<i class="spec"> · {specialty(key)}</i>{/if}</span>
              <Dots value={character.abilities[key]} label={traitLabel(key)} />
            </button>
            {#if opened === key && meaning}<p class="meaning">{meaning}</p>{/if}
          {:else}
            <p class="none">None trained</p>
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <section class="lower cols">
    <div>
      <h2>Disciplines</h2>
      {#each character.disciplines as d (d.name)}
        <div class="trait" title={gloss(findEntry(table.library, 'discipline', d.name)) || undefined}><span>{d.name}</span><Dots value={d.level} max={Math.max(5, d.level)} label={d.name} /></div>
      {:else}
        <p class="none">None</p>
      {/each}
      {#if character.merits.length || character.flaws.length}
        <h2 class="spaced">Merits and Flaws</h2>
        {#each character.merits as m, i (i)}
          <div class="trait" title={gloss(findEntry(table.library, 'merit', m.name)) || undefined}><span>{m.name}</span><span class="pts">{m.points} pt merit</span></div>
        {/each}
        {#each character.flaws as f, i (i)}
          <div class="trait" title={gloss(findEntry(table.library, 'flaw', f.name)) || undefined}><span>{f.name}</span><span class="pts">{f.points} pt flaw</span></div>
        {/each}
      {/if}
      <h2 class="spaced">Virtues</h2>
      {#each virtueKeys as key (key)}
        <div class="trait"><span>{traitLabel(key)}</span><Dots value={character.virtues[key as keyof typeof character.virtues] ?? 1} label={traitLabel(key)} /></div>
      {/each}
    </div>
    <div>
      <h2>{character.path === 'Humanity' ? 'Path of Humanity' : character.path}</h2>
      <p class="rating"><span>{character.pathRating}</span> of 10</p>
      <Dots value={character.pathRating} max={10} label={character.path} />
    </div>
    <div>
      <h2 class="health-head">Health {#if penalty}<span class="pen">−{penalty} to all pools</span>{/if}</h2>
      <HealthTrack
        track={healthOf(character)}
        flash={table.isFlashing(`${character.$id}:health`)}
        onmark={(type) => table.damage(character.$id, 1, type).catch(() => {})}
        onunmark={table.isStoryteller ? (type) => table.damage(character.$id, -1, type).catch(() => {}) : undefined}
      />
    </div>
  </section>
</article>

<script lang="ts" module>
  export function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
</script>

<style>
  .sheet {
    display: grid;
    gap: 28px;
  }
  header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px 32px;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 20px;
  }
  h1 {
    font-size: clamp(2rem, 4vw, 2.8rem);
    font-weight: 500;
    margin: 0;
    line-height: 1.1;
  }
  .name-input {
    font-size: 1.8rem;
    width: 100%;
  }
  .lineage {
    color: var(--oxblood);
    margin: 4px 0 0;
    font-size: 0.95rem;
  }
  .meta {
    display: grid;
    grid-template-columns: auto auto;
    gap: 4px 28px;
    margin: 0;
    font-size: 0.95rem;
  }
  .meta div {
    display: flex;
    gap: 0.4em;
  }
  dt {
    color: var(--ink-soft);
  }
  dd {
    margin: 0;
  }
  .meta label {
    display: grid;
    gap: 2px;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .meta label.wide {
    grid-column: span 2;
  }
  .edit {
    grid-column: 1 / -1;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .linkish {
    background: none;
    border: none;
    padding: 0;
    color: var(--ink-faint);
    text-decoration: underline dotted;
    font-size: 0.85rem;
  }
  h2 {
    font-weight: 500;
    font-size: 1.45rem;
    margin: 0 0 10px;
  }
  h2.spaced {
    margin-top: 22px;
  }
  h3 {
    margin: 0 0 6px;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 3px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
  }
  .trait {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }
  button.plain {
    width: 100%;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  button.plain:disabled {
    cursor: default;
  }
  .meaning {
    margin: 0 0 6px;
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.9rem;
  }
  .spec {
    color: var(--oxblood);
    font-size: 0.85rem;
  }
  .pts {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .none {
    color: var(--ink-faint);
    font-style: italic;
    margin: 4px 0;
  }
  .lower {
    border-top: 1px solid var(--rule);
    padding-top: 22px;
  }
  .rating {
    margin: 0 0 8px;
    color: var(--ink-soft);
  }
  .rating span {
    font-size: 4rem;
    line-height: 1;
    color: var(--oxblood);
    margin-right: 0.15em;
  }
  .health-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .pen {
    font-size: 0.85rem;
    color: var(--oxblood);
  }
  @media (max-width: 760px) {
    .cols,
    header {
      grid-template-columns: 1fr;
    }
  }
</style>
