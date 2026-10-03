<script lang="ts">
  import { setContext } from 'svelte';
  import { page } from '$app/state';
  import { DemoTable } from '$lib/demo.svelte';
  import TableBar from '$lib/components/TableBar.svelte';
  import RedCard from '$lib/components/RedCard.svelte';

  let { children } = $props();

  const table = new DemoTable();
  setContext('table', table);
  let opened = $state(false);
  void table.open().then(() => (opened = true));

  $effect(() => {
    table.viewAs(page.url.pathname.endsWith('/screen') ? 'storyteller' : 'player');
  });
</script>

<div class="ribbon" role="note">
  Demo table — the dice roll in your browser and nothing is saved. In the real app the client never rolls.
  <a href={page.url.pathname.endsWith('/screen') ? '/demo' : '/demo/screen'}>
    {page.url.pathname.endsWith('/screen') ? 'Sit down as Isolde’s player' : 'Step behind the Storyteller’s screen'}
  </a>
</div>
<TableBar {table} base="/demo" />
<RedCard {table} />
{#if opened}{@render children()}{/if}

{#if table.error}
  <div class="toast" role="alert">
    <span>{table.error}</span>
    <button onclick={() => (table.error = null)} aria-label="Dismiss">×</button>
  </div>
{/if}

<style>
  .ribbon {
    background: var(--screen);
    color: var(--screen-ink);
    text-align: center;
    padding: 8px 16px;
    font-size: 0.9rem;
  }
  .ribbon a {
    color: var(--gold-soft);
    margin-left: 0.6em;
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
