<script lang="ts">
  import { ID, Permission, Role } from 'appwrite';
  import { ABILITIES, ATTRIBUTES, traitLabel, woundPenalty } from '$engine/index.ts';
  import { DATABASE_ID, PORTRAITS_BUCKET_ID } from '$schema';
  import { healthOf, type Character } from '$shared/codec.ts';
  import { portraitUrl, storage, tables } from '$lib/appwrite';
  import type { TableState } from '$lib/table.svelte';
  import Dots from './Dots.svelte';
  import HealthTrack from './HealthTrack.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();

  const profile = $derived(table.profiles[character.$id] ?? {});
  const penalty = $derived(woundPenalty(healthOf(character)));
  const specialty = (trait: string) => character.specialties.find((s) => s.trait === trait)?.text;
  const isOwner = $derived(character.ownerId === table.me);

  let editing = $state(false);
  let draft = $state({ name: '', concept: '', nature: '', demeanor: '' });
  let saveError = $state<string | null>(null);
  let portraitBusy = $state(false);
  let portraitError = $state<string | null>(null);
  let portraitInput = $state<HTMLInputElement>();

  const portraitId = $derived(typeof profile.portrait === 'string' ? profile.portrait : '');
  const portrait = $derived(portraitUrl(portraitId));

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

  async function uploadPortrait(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    portraitError = null;
    const previousPortraitId = portraitId;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      portraitError = 'Choose a JPEG, PNG, GIF or WebP image.';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      portraitError = 'Portraits must be 5 MB or smaller.';
      return;
    }

    const teamId = table.chronicle?.teamId as string | undefined;
    if (!teamId) {
      portraitError = 'The table is still connecting. Try again in a moment.';
      return;
    }

    portraitBusy = true;
    let uploadedId = '';
    try {
      const uploaded = await storage.createFile({
        bucketId: PORTRAITS_BUCKET_ID,
        fileId: ID.unique(),
        file,
        permissions: [
          Permission.read(Role.user(table.me)),
          Permission.read(Role.team(teamId, 'storyteller')),
          Permission.update(Role.user(table.me)),
          Permission.delete(Role.user(table.me)),
        ],
      });
      uploadedId = uploaded.$id;
      await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: 'profiles',
        rowId: character.$id,
        data: { portrait: uploadedId },
      });
      if (previousPortraitId && previousPortraitId !== uploadedId) {
        await storage.deleteFile({ bucketId: PORTRAITS_BUCKET_ID, fileId: previousPortraitId }).catch(() => {});
      }
    } catch (e) {
      if (uploadedId) {
        await storage.deleteFile({ bucketId: PORTRAITS_BUCKET_ID, fileId: uploadedId }).catch(() => {});
      }
      portraitError = (e as Error).message;
    } finally {
      portraitBusy = false;
    }
  }

  async function removePortrait() {
    const fileId = portraitId;
    if (!fileId) return;
    portraitBusy = true;
    portraitError = null;
    try {
      await tables.updateRow({
        databaseId: DATABASE_ID,
        tableId: 'profiles',
        rowId: character.$id,
        data: { portrait: '' },
      });
      await storage.deleteFile({ bucketId: PORTRAITS_BUCKET_ID, fileId }).catch(() => {});
    } catch (e) {
      portraitError = (e as Error).message;
    } finally {
      portraitBusy = false;
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
    <div class="identity">
      <div class="portrait" class:empty={!portrait}>
        {#if portrait}
          <img src={portrait} alt={`${profile.name ?? 'Character'} portrait`} />
        {:else}
          <span aria-hidden="true">{(profile.name ?? '?').trim().charAt(0) || '?'}</span>
        {/if}
      </div>
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
        <input
          class="portrait-input"
          bind:this={portraitInput}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onchange={uploadPortrait}
        />
        <button class="linkish" disabled={portraitBusy} onclick={() => portraitInput?.click()}>
          {portraitBusy ? 'Uploading…' : portrait ? 'Replace portrait' : 'Upload portrait'}
        </button>
        {#if portrait}
          <button class="linkish" disabled={portraitBusy} onclick={removePortrait}>Remove portrait</button>
        {/if}
        {#if saveError}<span class="error">{saveError}</span>{/if}
        {#if portraitError}<span class="error">{portraitError}</span>{/if}
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
            <div class="trait"><span>{traitLabel(key)}</span><Dots value={character.attributes[key] ?? 1} label={traitLabel(key)} /></div>
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
            <div class="trait">
              <span>{traitLabel(key)}{#if specialty(key)}<i class="spec"> · {specialty(key)}</i>{/if}</span>
              <Dots value={character.abilities[key]} label={traitLabel(key)} />
            </div>
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
        <div class="trait"><span>{d.name}</span><Dots value={d.level} max={Math.max(5, d.level)} label={d.name} /></div>
      {:else}
        <p class="none">None</p>
      {/each}
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
  .identity {
    display: flex;
    align-items: center;
    gap: 20px;
    min-width: 0;
  }
  .portrait {
    width: 112px;
    aspect-ratio: 4 / 5;
    flex: 0 0 auto;
    overflow: hidden;
    border: 1px solid var(--gold);
    background: var(--blush);
    box-shadow: inset 0 0 0 4px var(--paper), inset 0 0 0 5px var(--gold-soft);
  }
  .portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .portrait.empty {
    display: grid;
    place-items: center;
    color: var(--oxblood);
    font-size: 3rem;
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
    flex-wrap: wrap;
  }
  .portrait-input {
    display: none;
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
  .spec {
    color: var(--oxblood);
    font-size: 0.85rem;
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
    .portrait {
      width: 88px;
    }
  }
</style>
