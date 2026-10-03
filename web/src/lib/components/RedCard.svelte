<script lang="ts">
  /**
   * The red card. Anyone at the table can raise it, any time, with one tap;
   * the thread stops and nobody owes an explanation. The server stores only
   * that a card is up, never who raised it. This screen alone remembers that
   * it was you, so you can see your card landed.
   */
  import type { TableState } from '$lib/table.svelte';

  let { table }: { table: TableState } = $props();

  const up = $derived(Boolean(table.chronicle?.redCardAt));
  let mine = $state(false);
  let busy = $state(false);

  $effect(() => {
    if (!up) mine = false;
  });

  async function raise() {
    busy = true;
    const ok = await table.act('chronicle', { action: 'redCard', chronicleId: table.chronicleId });
    if (ok) mine = true;
    busy = false;
  }

  async function clear() {
    busy = true;
    await table.act('chronicle', { action: 'clearRedCard', chronicleId: table.chronicleId });
    busy = false;
  }
</script>

{#if table.chronicle}
  {#if up}
    <div class="redcard" role="alert" aria-live="assertive">
      <div class="face" aria-hidden="true"></div>
      <div class="words">
        <strong>Red card.</strong>
        Someone at the table needs this thread to stop. Nobody has to explain why, and nobody should ask.
        {#if table.isStoryteller}
          <span class="st">Rewind, skip past it or take the scene somewhere else, then clear the card.</span>
        {:else if mine}
          <span class="st">You raised it. Only you know that.</span>
        {:else}
          <span class="st">The Storyteller will move the scene on.</span>
        {/if}
      </div>
      {#if table.isStoryteller}
        <button class="btn" disabled={busy} onclick={clear}>We've moved on — clear it</button>
      {/if}
    </div>
  {:else}
    <button
      class="raise"
      disabled={busy}
      onclick={raise}
      title="Stop the current thread, anonymously. No explanation needed."
      aria-label="Raise the red card: stop the current thread, anonymously"
    >
      <span class="face" aria-hidden="true"></span> Red card
    </button>
  {/if}
{/if}

<style>
  .redcard {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 18px;
    padding: 14px var(--gutter);
    background: var(--oxblood);
    color: var(--paper);
  }
  .words {
    flex: 1 1 320px;
    min-width: 0;
  }
  .st {
    display: block;
    font-style: italic;
    opacity: 0.9;
    margin-top: 2px;
  }
  .redcard .btn {
    background: var(--paper);
    color: var(--oxblood);
    border-color: var(--paper);
  }
  .face {
    display: inline-block;
    width: 18px;
    height: 26px;
    border-radius: 3px;
    background: #b3121b;
    border: 2px solid var(--paper);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.4);
    flex: none;
  }
  .redcard .face {
    width: 24px;
    height: 34px;
  }
  .raise {
    position: fixed;
    left: 16px;
    bottom: 16px;
    z-index: 9;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px 8px 10px;
    background: var(--paper);
    color: var(--oxblood);
    border: 1px solid var(--oxblood);
    font-family: var(--caps);
    font-size: 0.85rem;
    letter-spacing: 0.04em;
    cursor: pointer;
  }
  .raise .face {
    border-color: var(--oxblood);
  }
  .raise:hover,
  .raise:focus-visible {
    background: var(--oxblood);
    color: var(--paper);
  }
  .raise:hover .face,
  .raise:focus-visible .face {
    border-color: var(--paper);
  }
</style>
