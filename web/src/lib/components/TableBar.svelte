<script lang="ts">
  import { page } from '$app/state';
  import type { TableState } from '$lib/table.svelte';
  import ThemePicker from './ThemePicker.svelte';

  let { table, base }: { table: TableState; base: string } = $props();

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
</script>

<header class="bar">
  <a class="mark" href="/">Coterie</a>
  {#if table.chronicle}
    <span class="chronicle">{table.chronicle.name}</span>
    {#if table.isStoryteller && page.url.pathname.endsWith('/screen')}
      <span class="badge caps">Storyteller's screen</span>
    {/if}
    <span class="scene caps">
      {#if table.scene}Scene — {table.scene.name} · Turn {table.scene.turn}{:else}Between scenes{/if}
    </span>
  {/if}
  <nav>
    {#if table.isStoryteller}
      {#if page.url.pathname.endsWith('/screen')}
        {#if table.mine.length}<a href={base}>My sheet</a>{/if}
      {:else}
        <a href={`${base}/screen`}>The screen</a>
      {/if}
    {/if}
    <ThemePicker />
    <span class="caps at">At the table</span>
    <ul class="avatars">
      {#each table.members as m (m.userId)}
        {@const here = table.atTable.includes(m)}
        <li class:here class:st={m.roles.includes('storyteller')} title={`${m.name}${here ? '' : ' — away'}`}>
          {m.roles.includes('storyteller') ? 'ST' : initials(m.name)}
        </li>
      {/each}
    </ul>
  </nav>
</header>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px 24px;
    padding: 20px var(--gutter);
    border-bottom: 1px solid var(--rule);
  }
  .mark {
    font-style: italic;
    color: var(--oxblood);
    font-size: 1.8rem;
    text-decoration: none;
  }
  .chronicle {
    font-size: 1.35rem;
  }
  .scene {
    color: var(--ink-soft);
  }
  .badge {
    background: var(--screen);
    color: var(--screen-ink);
    padding: 0.2em 0.8em;
    font-size: 0.9rem;
  }
  nav {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  nav a {
    color: var(--ink-soft);
  }
  .at {
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .avatars {
    display: flex;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .avatars li {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-family: var(--caps);
    font-size: 0.8rem;
    border: 1px dashed var(--ink-faint);
    color: var(--ink-faint);
  }
  .avatars li.here {
    background: var(--ink);
    color: var(--paper);
    border: 1px solid var(--ink);
  }
</style>
