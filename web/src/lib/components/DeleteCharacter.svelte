<script lang="ts">
  /** Deleting a character for good. Typing the name is the confirmation, and the server checks it too. */
  import type { Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';

  let { table, character, ondeleted }: { table: TableState; character: Character; ondeleted?: () => void } = $props();

  let open = $state(false);
  let typed = $state('');
  let busy = $state(false);
  const name = $derived(table.nameOf(character.$id));
  const matches = $derived(typed.trim().toLowerCase() === name.trim().toLowerCase());

  async function remove() {
    busy = true;
    const portrait = table.profiles[character.$id]?.portrait as string | undefined;
    const out = await table.act('character', { action: 'delete', characterId: character.$id, name: typed });
    busy = false;
    if (out) {
      // The sheet is gone; its portrait file goes too (owner and Storyteller may both delete it).
      if (portrait) void table.deletePortraitFile(portrait);
      open = false;
      typed = '';
      ondeleted?.();
    }
  }
</script>

<div class="delete">
  {#if !open}
    <button type="button" class="btn quiet danger" onclick={() => (open = true)}>Delete {name}</button>
  {:else}
    <p>
      This removes {name} for good: the sheet, any open proposal, and their place in scenes. Their past rolls stay in the
      feed. It can't be undone.
    </p>
    <label>Type <b>{name}</b> to confirm <input bind:value={typed} autocomplete="off" aria-label="Character name to confirm" /></label>
    <div class="row">
      <button type="button" class="btn solid danger" disabled={!matches || busy} onclick={remove}>{busy ? 'Deleting…' : 'Delete for good'}</button>
      <button type="button" class="btn quiet" onclick={() => ((open = false), (typed = ''))}>Keep {name}</button>
    </div>
  {/if}
</div>

<style>
  .delete {
    display: grid;
    gap: 8px;
  }
  p {
    margin: 0;
    color: var(--ink-soft);
    font-style: italic;
  }
  label {
    display: grid;
    gap: 4px;
    max-width: 360px;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .danger {
    color: var(--oxblood);
  }
  .btn.solid.danger {
    background: var(--oxblood);
    border-color: var(--oxblood);
    color: #fff;
  }
  .btn.solid.danger:disabled {
    opacity: 0.5;
  }
</style>
