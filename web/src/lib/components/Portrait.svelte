<script lang="ts">
  /** A character's portrait, or the first letter of their name in its frame. */
  import type { TableState } from '$lib/table.svelte';

  let { table, fileId, name, size = 'large' }: { table: TableState; fileId: string; name: string; size?: 'large' | 'small' } = $props();

  let src = $state<string | null>(null);
  $effect(() => {
    const id = fileId;
    src = null;
    if (!id) return;
    void table.portraitSrc(id).then((url) => {
      if (id === fileId) src = url;
    });
  });

  const initial = $derived((name || '?').trim().charAt(0).toUpperCase() || '?');
</script>

<div class="portrait {size}" class:empty={!src}>
  {#if src}
    <img {src} alt={`Portrait of ${name || 'this character'}`} />
  {:else}
    <span aria-hidden="true">{initial}</span>
  {/if}
</div>

<style>
  .portrait {
    width: 112px;
    aspect-ratio: 4 / 5;
    flex: 0 0 auto;
    overflow: hidden;
    border: 1px solid var(--gold);
    background: var(--blush);
    box-shadow: inset 0 0 0 4px var(--paper), inset 0 0 0 5px var(--gold-soft);
  }
  .portrait.small {
    width: 52px;
    box-shadow: inset 0 0 0 2px var(--paper), inset 0 0 0 3px var(--gold-soft);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .empty {
    display: grid;
    place-items: center;
    color: var(--oxblood);
    font-size: 3rem;
  }
  .small.empty {
    font-size: 1.5rem;
  }
  @media (max-width: 700px) {
    .large {
      width: 88px;
    }
  }
</style>
