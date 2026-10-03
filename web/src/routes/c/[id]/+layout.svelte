<script lang="ts">
  import { onDestroy, setContext } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { session } from '$lib/session.svelte';
  import { TableState } from '$lib/table.svelte';
  import TableBar from '$lib/components/TableBar.svelte';
  import RedCard from '$lib/components/RedCard.svelte';
  import FallBanner from '$lib/components/FallBanner.svelte';

  let { children } = $props();

  if (!session.user) void goto('/');

  const table = new TableState(page.params.id!, session.user?.$id ?? '', session.user?.name || session.user?.email || 'Someone');
  setContext('table', table);

  let failed = $state<string | null>(null);
  let opened = $state(false);
  table
    .open()
    .then(() => (opened = true))
    .catch((e) => (failed = (e as Error).message));
  onDestroy(() => void table.close());
</script>

<TableBar {table} base={`/c/${table.chronicleId}`} />
<RedCard {table} />
<FallBanner {table} />

{#if failed}
  <p class="failed error">{failed}</p>
{:else if opened}
  {@render children()}
{:else}
  <p class="failed">Taking your seat…</p>
{/if}

{#if table.error}
  <div class="toast" role="alert">
    <span>{table.error}</span>
    <button onclick={() => (table.error = null)} aria-label="Dismiss">×</button>
  </div>
{/if}

<style>
  .failed {
    text-align: center;
    padding: 12vh 16px;
    font-style: italic;
  }
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    max-width: min(560px, calc(100vw - 32px));
    background: var(--screen);
    color: var(--screen-ink);
    border: 1px solid var(--oxblood);
    padding: 12px 16px;
    display: flex;
    gap: 16px;
    align-items: start;
    z-index: 10;
  }
  .toast button {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.3rem;
    line-height: 1;
  }
</style>
