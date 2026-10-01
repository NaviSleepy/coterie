<script lang="ts">
  /**
   * The table's reference library. The Storyteller writes the entries in
   * their own words; everyone at the table reads them, and the sheet editors
   * offer them by name.
   */
  import { untrack } from 'svelte';
  import type { AnyRow } from '$lib/appwrite';
  import type { TableState } from '$lib/table.svelte';
  import { entriesOf, KIND_LABELS, kindLabel, type LibraryKind } from '$lib/library';

  let { table }: { table: TableState } = $props();

  const kinds = Object.keys(KIND_LABELS) as LibraryKind[];
  const costed = (k: string) => k === 'merit' || k === 'flaw';
  const count = $derived(Object.keys(table.library).length);
  // Open for a Storyteller with an empty library, once; after that it's the reader's to toggle.
  let open = $state(untrack(() => table.isStoryteller && Object.keys(table.library).length === 0));

  type Form = { entryId?: string; kind: LibraryKind; name: string; points: number; summary: string; page: string };
  const blank = (kind: LibraryKind = 'merit'): Form => ({ kind, name: '', points: 1, summary: '', page: '' });
  let form = $state<Form | null>(null);

  function edit(e: AnyRow) {
    form = { entryId: e.$id, kind: e.kind, name: e.name, points: e.points ?? 1, summary: e.summary ?? '', page: e.page ?? '' };
  }

  async function save() {
    if (!form) return;
    const { points, ...rest } = form;
    const out = await table.act('chronicle', {
      action: 'saveEntry',
      chronicleId: table.chronicleId,
      ...rest,
      ...(costed(form.kind) ? { points } : {}),
    });
    if (out) form = null;
  }

  async function remove(entryId: string) {
    await table.act('chronicle', { action: 'removeEntry', chronicleId: table.chronicleId, entryId });
    if (form?.entryId === entryId) form = null;
  }
</script>

<details class="library panel" bind:open>
  <summary>
    <h2>Reference library</h2>
    <span class="hint">{count} {count === 1 ? 'entry' : 'entries'}{table.isStoryteller ? '' : ', written by the Storyteller'}</span>
  </summary>

  {#if table.isStoryteller}
    <p class="hint">Write entries in your own words, with a page number for anyone who owns the book. Players see them here and pick from them when they propose changes.</p>
    {#if form}
      <form class="entry-form" onsubmit={(e) => { e.preventDefault(); void save(); }}>
        <div class="row">
          <select bind:value={form.kind} aria-label="Kind">
            {#each kinds as k (k)}<option value={k}>{kindLabel(k)}</option>{/each}
          </select>
          <input class="name" bind:value={form.name} placeholder="Name" aria-label="Name" required />
          {#if costed(form.kind)}
            <label class="pts">Points <input type="number" min="1" max="7" bind:value={form.points} /></label>
          {/if}
          <input class="page" bind:value={form.page} placeholder="V20 p. 000" aria-label="Page reference" />
        </div>
        <textarea bind:value={form.summary} rows="3" placeholder="What it does at your table, in your words" aria-label="Summary"></textarea>
        <div class="row">
          <button class="btn solid" disabled={!form.name.trim()}>{form.entryId ? 'Save' : 'Add'}</button>
          <button type="button" class="btn quiet" onclick={() => (form = null)}>Cancel</button>
        </div>
      </form>
    {:else}
      <button class="btn" onclick={() => (form = blank())}>Add an entry</button>
    {/if}
  {/if}

  {#each kinds as k (k)}
    {@const entries = entriesOf(table.library, k)}
    {#if entries.length}
      <h3 class="label">{KIND_LABELS[k]}</h3>
      <ul>
        {#each entries as e (e.$id)}
          <li>
            <div class="head">
              <b>{e.name}</b>
              {#if costed(k)}<span class="meta">{e.points} pt</span>{/if}
              {#if e.page}<span class="meta">{e.page}</span>{/if}
              {#if table.isStoryteller}
                <span class="tools">
                  <button class="linkish" onclick={() => edit(e)}>edit</button>
                  <button class="linkish" onclick={() => remove(e.$id)}>remove</button>
                </span>
              {/if}
            </div>
            {#if e.summary}<p>{e.summary}</p>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  {/each}
</details>

<style>
  .library {
    display: grid;
    gap: 10px;
  }
  summary {
    display: flex;
    align-items: baseline;
    gap: 12px;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: '▸';
    color: var(--ink-faint);
  }
  details[open] > summary::before {
    content: '▾';
  }
  h2 {
    font-weight: 500;
    margin: 0;
  }
  h3 {
    margin: 14px 0 4px;
  }
  .hint {
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.9rem;
    margin: 6px 0;
  }
  .entry-form {
    display: grid;
    gap: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .name {
    flex: 1;
    min-width: 160px;
  }
  .page {
    width: 9em;
  }
  .pts input {
    width: 3.5em;
  }
  textarea {
    width: 100%;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .head {
    display: flex;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  b {
    font-weight: 500;
  }
  .meta {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .tools {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
  .linkish {
    background: none;
    border: none;
    color: var(--ink-faint);
    text-decoration: underline dotted;
    padding: 0;
    font-size: 0.85rem;
  }
  li p {
    margin: 2px 0 0;
    color: var(--ink-soft);
  }
</style>
