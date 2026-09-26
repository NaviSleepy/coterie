<script lang="ts">
  /**
   * The Storyteller's view of every open proposal, live as players type.
   * Approving names the revision on screen, so a draft that changed in the
   * last moment is refused rather than applied unseen.
   */
  import { parseJson } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import { describe, type Draft } from '$lib/sheet-edit';

  let { table }: { table: TableState } = $props();

  const open = $derived(
    Object.values(table.proposals)
      .map((p) => ({ p, c: table.characters[p.$id] }))
      .filter(({ c }) => c)
      .map(({ p, c }) => ({ p, c, lines: describe(c, parseJson<Partial<Draft>>(p.sheet, {})) })),
  );
  let notes = $state<Record<string, string>>({});
</script>

{#if open.length}
  <section class="review panel">
    <h2>Proposed changes</h2>
    {#each open as { p, c, lines } (p.$id)}
      <article class:declined={p.status === 'declined'}>
        <header>
          <h3>{table.nameOf(c.$id)}</h3>
          <span class="state">{p.status === 'declined' ? 'Declined — waiting on the player' : 'Waiting for you'}</span>
        </header>
        {#if lines.length}
          <ul>{#each lines as l (l)}<li>{l}</li>{/each}</ul>
        {:else}
          <p class="hint">No visible differences from the sheet.</p>
        {/if}
        {#if p.status !== 'declined'}
          <div class="row">
            <button class="btn solid" onclick={() => table.act('character', { action: 'approve', characterId: c.$id, revision: p.revision })}>Approve</button>
            <input bind:value={notes[p.$id]} placeholder="Why not (optional)" aria-label="Reason for declining" />
            <button class="btn quiet" onclick={() => table.act('character', { action: 'reject', characterId: c.$id, note: notes[p.$id] ?? '' })}>Decline</button>
          </div>
        {/if}
      </article>
    {/each}
  </section>
{/if}

<style>
  .review {
    display: grid;
    gap: 14px;
  }
  h2 {
    font-weight: 500;
    margin: 0;
  }
  article {
    display: grid;
    gap: 6px;
    border-top: 1px solid var(--rule);
    padding-top: 10px;
  }
  article.declined {
    opacity: 0.6;
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
  }
  h3 {
    margin: 0;
    font-weight: 500;
  }
  .state,
  .hint {
    color: var(--ink-soft);
    font-style: italic;
    font-size: 0.9rem;
  }
  ul {
    margin: 0;
    padding-left: 1.2em;
    columns: 2 200px;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row input {
    flex: 1;
    min-width: 160px;
  }
</style>
