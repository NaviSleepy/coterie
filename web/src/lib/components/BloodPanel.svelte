<script lang="ts">
  import type { Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import BloodPool from './BloodPool.svelte';
  import WillpowerTrack from './WillpowerTrack.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();

  const spentThisTurn = $derived(character.bloodPerTurn - table.remainingThisTurn(character));
  let refusal = $state<string | null>(null);

  async function spend() {
    refusal = null;
    try {
      await table.spend(character.$id, 1, 'spent');
    } catch {
      // A refusal is copy, not an error: show it where the button is.
      refusal = table.error;
      table.error = null;
    }
  }

  async function heal() {
    refusal = null;
    const out = await table.act('feedAndHeal', { characterId: character.$id, heal: 1 });
    if (!out) {
      refusal = table.error;
      table.error = null;
    }
  }

  const hurt = $derived(character.healthBashing + character.healthLethal > 0);
</script>

<section class="panel blood">
  <div class="top">
    <h2>Blood Pool</h2>
    <span class="count"><b>{character.bloodPool}</b> / {character.bloodPoolMax}</span>
  </div>
  <BloodPool pool={character.bloodPool} max={character.bloodPoolMax} flash={table.isFlashing(`${character.$id}:blood`)} />
  <div class="row">
    <span class="turn">{spentThisTurn} of {character.bloodPerTurn} spent this turn</span>
    <div class="actions">
      {#if hurt}<button class="btn quiet" onclick={heal} disabled={character.bloodPool === 0}>Heal a box</button>{/if}
      <button class="btn" onclick={spend} disabled={character.bloodPool === 0}>Spend blood</button>
    </div>
  </div>
  {#if refusal}
    <div class="refusal" role="alert">
      <span class="label">Spend refused</span>
      <p>{refusal}</p>
    </div>
  {/if}
  <div class="wp">
    <h2>Willpower</h2>
    <WillpowerTrack permanent={character.willpowerPermanent} temporary={character.willpowerTemporary} />
  </div>
</section>

<style>
  .blood {
    display: grid;
    gap: 14px;
  }
  .top,
  .row,
  .wp {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  h2 {
    margin: 0;
    font-weight: 500;
    font-size: 1.4rem;
  }
  .count b {
    color: var(--oxblood);
    font-size: 1.3rem;
  }
  .turn {
    color: var(--ink-soft);
    font-size: 0.95rem;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .refusal {
    border: 1px solid var(--oxblood);
    padding: 10px 14px;
    background: color-mix(in oklab, var(--oxblood) 6%, transparent);
  }
  .refusal p {
    margin: 4px 0 0;
  }
  .wp {
    border-top: 1px solid var(--rule);
    padding-top: 14px;
  }
</style>
