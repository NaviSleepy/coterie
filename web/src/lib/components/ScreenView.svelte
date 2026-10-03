<script lang="ts">
  import type { TableState } from '$lib/table.svelte';
  import BehindScreen from './BehindScreen.svelte';
  import CoterieCard from './CoterieCard.svelte';
  import LibraryPanel from './LibraryPanel.svelte';
  import Notepad from './Notepad.svelte';
  import NpcPanel from './NpcPanel.svelte';
  import CreationBudget from './CreationBudget.svelte';
  import CreationRequests from './CreationRequests.svelte';
  import ProposalsReview from './ProposalsReview.svelte';
  import StControls from './StControls.svelte';

  let { table, canCreate = true }: { table: TableState; canCreate?: boolean } = $props();

  let selected = $state<string | null>(null);
  const character = $derived(selected ? table.view(selected) : null);

  let sceneName = $state('');
  let npcLabel = $state('');
  let npcValue = $state(7);
  let npcs = $state<{ label: string; value: number }[]>([]);
  /** NPCs from the roster ticked "in the fight"; the server rolls their initiative. */
  let fighting = $state<string[]>([]);

  const botchCopy = $derived(
    table.chronicle?.botchRule === 'only-negative-is-a-botch' ? 'only below zero is a botch' : 'zero with a 1 is a botch',
  );
</script>

<main class="screen-page">
  <div class="status">
    <span>{table.atTable.length} of {table.members.length} at the table</span>
    <span>Botch rule: <b>{botchCopy}</b></span>
    <span>Invite code: <b class="code">{table.chronicle?.inviteCode}</b>
      <button class="linkish" onclick={() => table.act('chronicle', { action: 'rotateInvite', chronicleId: table.chronicleId })}>rotate</button>
    </span>
  </div>

  <div class="columns">
    <div class="main">
      <section class="panel scene">
        {#if table.scene}
          <div class="scene-name">
            <span class="label">Scene</span>
            <h2>{table.scene.name}</h2>
          </div>
          <div class="turn"><span class="label">Turn</span> <span class="n">{table.scene.turn}</span></div>
          <ol class="init">
            {#each table.initiative as e, i (i)}
              <li class:npc={!e.characterId}>{e.value} · {e.label}</li>
            {:else}
              <li class="quiet">No initiative this turn</li>
            {/each}
          </ol>
          <div class="scene-actions">
            <button class="btn solid" onclick={() => table.act('scene', { action: 'advance', chronicleId: table.chronicleId })}>Advance turn</button>
            <button class="btn" onclick={() => table.act('scene', { action: 'rollInitiative', chronicleId: table.chronicleId, entries: npcs, npcIds: fighting })}>Roll initiative</button>
            <button class="btn quiet" onclick={() => table.act('scene', { action: 'end', chronicleId: table.chronicleId })}>End scene</button>
          </div>
          <form class="npc" onsubmit={(e) => { e.preventDefault(); if (npcLabel.trim()) { npcs = [...npcs, { label: npcLabel.trim(), value: npcValue }]; npcLabel = ''; } }}>
            <span class="label">Extras in the order</span>
            {#each npcs as n, i (i)}
              <button type="button" class="chip" onclick={() => (npcs = npcs.filter((_, j) => j !== i))} title="Remove">{n.value} · {n.label} ×</button>
            {/each}
            <input bind:value={npcLabel} placeholder="Two thugs" aria-label="Extra name" />
            <input type="number" min="0" max="40" bind:value={npcValue} aria-label="Extra initiative" />
            <button class="btn quiet" type="submit">Add</button>
          </form>
        {:else}
          <form class="start" onsubmit={(e) => { e.preventDefault(); void table.act('scene', { action: 'start', chronicleId: table.chronicleId, name: sceneName }).then(() => (sceneName = '')); }}>
            <span class="label">Between scenes</span>
            <input bind:value={sceneName} placeholder="The Rookery Gallery" aria-label="Scene name" />
            <button class="btn solid" disabled={!sceneName.trim()}>Open the scene</button>
          </form>
        {/if}
      </section>

      <NpcPanel {table} bind:fighting />
      <CreationRequests {table} />
      <ProposalsReview {table} />
      <CreationBudget {table} />
      <LibraryPanel {table} />
      <Notepad {table} />

      {#if character}
        {#key character.$id}<StControls {table} {character} onclose={() => (selected = null)} />{/key}
      {/if}

      {#if canCreate}
        <div class="dmpc-bar">
          <a class="btn quiet" href={`/c/${table.chronicleId}/new`}>Create a DMPC</a>
          {#if table.mine.length}<a class="btn quiet" href={`/c/${table.chronicleId}`}>Play your DMPC{table.mine.length > 1 ? 's' : ''}</a>{/if}
        </div>
      {/if}
      <div class="cards">
        {#each table.coterie as c (c.$id)}
          {@const v = table.view(c.$id)}
          {#if v}<CoterieCard {table} character={v} onselect={() => (selected = c.$id)} />{/if}
        {:else}
          <p class="quiet">No characters yet. Share the invite code: <b>{table.chronicle?.inviteCode}</b></p>
        {/each}
      </div>
    </div>

    <BehindScreen {table} />
  </div>
</main>

<style>
  .screen-page {
    padding: 20px var(--gutter) 32px;
    max-width: 1500px;
    margin: 0 auto;
    display: grid;
    gap: 20px;
  }
  .status {
    display: flex;
    justify-content: flex-end;
    gap: 28px;
    flex-wrap: wrap;
    color: var(--ink-soft);
    font-size: 0.95rem;
  }
  .status b {
    color: var(--ink);
    font-weight: 500;
  }
  .code {
    letter-spacing: 0.12em;
    font-variant-numeric: lining-nums;
  }
  .linkish {
    background: none;
    border: none;
    color: var(--ink-faint);
    text-decoration: underline dotted;
    padding: 0 0 0 4px;
    font-size: 0.85rem;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
    gap: 28px;
    align-items: start;
  }
  .main {
    display: grid;
    gap: 24px;
  }
  .scene {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 16px 28px;
    align-items: center;
  }
  .scene h2 {
    margin: 0;
    font-weight: 500;
    font-size: 1.7rem;
    line-height: 1.1;
  }
  .turn {
    border-left: 1px solid var(--rule);
    padding-left: 24px;
  }
  .n {
    font-size: 3rem;
    color: var(--oxblood);
    line-height: 1;
  }
  .init {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .init li,
  .chip {
    border: 1px solid var(--gold-soft);
    padding: 0.15em 0.6em;
    background: var(--paper);
    font-size: 0.95rem;
  }
  .init li.npc {
    border-style: dashed;
    border-color: var(--oxblood);
    color: var(--oxblood);
  }
  .scene-actions {
    display: grid;
    gap: 8px;
  }
  .npc,
  .start {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .npc input[type='number'] {
    width: 4.5em;
  }
  .start input {
    flex: 1;
    min-width: 12em;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }
  .quiet {
    color: var(--ink-faint);
    font-style: italic;
  }
  @media (max-width: 1100px) {
    .columns {
      grid-template-columns: 1fr;
    }
    .scene {
      grid-template-columns: 1fr;
    }
    .turn {
      border-left: none;
      padding-left: 0;
    }
  }
  .dmpc-bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
</style>
