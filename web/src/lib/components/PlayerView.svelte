<script lang="ts">
  import type { TableState } from '$lib/table.svelte';
  import BloodPanel from './BloodPanel.svelte';
  import HungerPrompt from './HungerPrompt.svelte';
  import RollFeed from './RollFeed.svelte';
  import RollPanel from './RollPanel.svelte';
  import Secrets from './Secrets.svelte';
  import Sheet from './Sheet.svelte';

  let { table, base }: { table: TableState; base: string } = $props();

  let selected = $state<string | null>(null);
  const mine = $derived(table.mine);
  const characterId = $derived(selected ?? mine[0]?.$id ?? null);
  const character = $derived(characterId ? table.view(characterId) : null);

  // Blood changes the interface, not just a number.
  const hunger = $derived(character ? 1 - character.bloodPool / Math.max(1, character.bloodPoolMax) : 0);
  $effect(() => {
    const body = document.body;
    body.style.setProperty('--hunger', String(hunger));
    body.classList.toggle('hungry', hunger > 0.5);
    body.classList.toggle('starving', !!character && character.bloodPool <= Math.max(1, Math.floor(character.bloodPoolMax * 0.1)));
    return () => {
      body.classList.remove('hungry', 'starving');
      body.style.removeProperty('--hunger');
    };
  });
</script>

{#if !character}
  <main class="empty">
    <p>You have no one at this table yet.</p>
    <a class="btn solid" href={`${base}/new`}>Bring a character</a>
  </main>
{:else}
  <main class="table">
    <div class="left">
      {#if mine.length > 1}
        <div class="switch">
          {#each mine as c (c.$id)}
            <button class="btn" class:quiet={c.$id !== characterId} onclick={() => (selected = c.$id)}>{table.nameOf(c.$id)}</button>
          {/each}
        </div>
      {/if}
      <Sheet {table} {character} />
      <Secrets {table} />
    </div>
    <div class="right">
      {#if character.bloodPool <= Math.max(1, Math.floor(character.bloodPoolMax * 0.1))}
        <p class="beast caps">The Beast is close</p>
      {/if}
      <BloodPanel {table} {character} />
      {#if character.bloodPool === 0}<HungerPrompt {table} {character} />{/if}
      <RollPanel {table} {character} />
      <RollFeed {table} />
    </div>
  </main>
{/if}

<style>
  .table {
    display: grid;
    grid-template-columns: minmax(0, 1.9fr) minmax(320px, 1fr);
    gap: 32px;
    padding: 32px var(--gutter);
    max-width: 1500px;
    margin: 0 auto;
  }
  .left,
  .right {
    display: grid;
    gap: 24px;
    align-content: start;
  }
  .switch {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .beast {
    margin: 0;
    text-align: right;
    color: var(--oxblood);
    letter-spacing: 0.12em;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 16px;
    padding: 14vh 16px;
    font-style: italic;
  }
  @media (max-width: 980px) {
    .table {
      grid-template-columns: 1fr;
    }
    /* At the table on a phone, blood and dice matter more than the full sheet. */
    .right {
      order: -1;
    }
  }
</style>
