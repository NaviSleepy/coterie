<script lang="ts">
  /**
   * What the character carries. It lives on the profile, which the owner
   * writes directly, so changes save as they're made. Picking a weapon or
   * armor from the library shows its numbers beside it.
   */
  import { parseJson, type Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import { entriesOf, findEntry, gloss } from '$lib/library';

  let { table, character }: { table: TableState; character: Character } = $props();

  type Item = { name: string; note?: string };
  const canEdit = $derived(character.ownerId === table.me);
  const items = $derived(parseJson<Item[]>(table.profiles[character.$id]?.equipment, []));

  let name = $state('');
  let note = $state('');
  let busy = $state(false);

  async function save(next: Item[]) {
    busy = true;
    await table.saveProfile(character.$id, { equipment: JSON.stringify(next.slice(0, 40)) });
    busy = false;
  }

  async function add() {
    if (!name.trim()) return;
    await save([...items, { name: name.trim().slice(0, 80), ...(note.trim() ? { note: note.trim().slice(0, 160) } : {}) }]);
    name = '';
    note = '';
  }
</script>

<section class="panel side" aria-label="Gear">
  <h2 class="label">Gear</h2>
  {#if items.length}
    <ul>
      {#each items as item, i (i)}
        {@const ref = gloss(findEntry(table.library, 'equipment', item.name))}
        <li>
          <div class="row">
            <b>{item.name}</b>
            {#if canEdit}<button class="linkish" disabled={busy} onclick={() => save(items.filter((_, j) => j !== i))} aria-label={`Drop ${item.name}`}>drop</button>{/if}
          </div>
          {#if item.note}<span class="note">{item.note}</span>{/if}
          {#if ref}<span class="ref">{ref}</span>{/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="note">Carrying nothing worth writing down.</p>
  {/if}

  {#if canEdit}
    <datalist id="lib-equipment">{#each entriesOf(table.library, 'equipment') as e (e.$id)}<option value={e.name}></option>{/each}</datalist>
    <form onsubmit={(e) => { e.preventDefault(); void add(); }}>
      <input bind:value={name} list="lib-equipment" placeholder="Pistol, Lt." aria-label="Item" maxlength="80" />
      <input bind:value={note} placeholder="Note (optional)" aria-label="Note" maxlength="160" />
      <button class="btn quiet" disabled={busy || !name.trim()}>Add</button>
    </form>
    {#if gloss(findEntry(table.library, 'equipment', name))}<p class="ref">{gloss(findEntry(table.library, 'equipment', name))}</p>{/if}
  {/if}
</section>

<style>
  .side {
    display: grid;
    gap: 10px;
  }
  h2 {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: grid;
    gap: 2px;
    border-top: 1px solid var(--rule);
    padding-top: 6px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .note,
  .ref {
    color: var(--ink-soft);
    font-size: 0.92rem;
  }
  .ref {
    font-style: italic;
  }
  p {
    margin: 0;
  }
  form {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  form input {
    flex: 1 1 140px;
    min-width: 0;
  }
  .linkish {
    background: none;
    border: none;
    color: var(--ink-faint);
    text-decoration: underline dotted;
    padding: 0;
    font-size: 0.85rem;
    cursor: pointer;
  }
</style>
