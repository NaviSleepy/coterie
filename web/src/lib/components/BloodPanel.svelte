<script lang="ts">
  import { theme } from '$lib/theme.svelte';
  import { bloodRules, isThinBlooded, REAWAKEN_BLOOD, usableBlood } from '$engine/index.ts';
  import type { Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import BloodPool from './BloodPool.svelte';
  import WillpowerTrack from './WillpowerTrack.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();

  const spentThisTurn = $derived(character.bloodPerTurn - table.remainingThisTurn(character));
  const rules = $derived(bloodRules(character));
  const usable = $derived(usableBlood(character.bloodPool, rules));
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

  /** Time of Thin Blood: a thin-blood can buy back a mortal function for the night. */
  const canReawaken = $derived(character.template !== 'dhampir' && isThinBlooded(character.generation));
  let reawakening = $state(false);
  let reawakenFor = $state('');
  async function reawaken() {
    refusal = null;
    const out = await table.act('spendBlood', { characterId: character.$id, reawaken: true, reason: reawakenFor.trim() || undefined });
    if (out) {
      reawakening = false;
      reawakenFor = '';
    } else {
      refusal = table.error;
      table.error = null;
    }
  }

  const hurt = $derived(character.healthBashing + character.healthLethal > 0);
</script>

<section class="panel blood">
  <div class="top">
    <h2>{theme.words.blood}</h2>
    <span class="count"><b>{character.bloodPool}</b> / {character.bloodPoolMax}</span>
  </div>
  <BloodPool pool={character.bloodPool} max={character.bloodPoolMax} reserve={rules.reserve} flash={table.isFlashing(`${character.$id}:blood`)} />
  {#if rules.reserve || rules.multiplier > 1}
    <p class="thin">Thin blood: {#if rules.reserve}the dashed {rules.reserve} only keep you rising{/if}{#if rules.reserve && rules.multiplier > 1}{', and '}{/if}{#if rules.multiplier > 1}each point of effect costs {rules.multiplier}{/if}. {usable} to spend.</p>
  {/if}
  <div class="row">
    <span class="turn">{spentThisTurn} of {character.bloodPerTurn} spent this turn</span>
    <div class="actions">
      {#if hurt}<button class="btn quiet" onclick={heal} disabled={usable === 0}>Heal a box</button>{/if}
      <button class="btn" onclick={spend} disabled={usable === 0}>Spend blood</button>
    </div>
  </div>
  {#if canReawaken}
    {#if reawakening}
      <form class="reawaken" onsubmit={(e) => { e.preventDefault(); void reawaken(); }}>
        <input bind:value={reawakenFor} placeholder="Eating, a heartbeat, a child…" aria-label="What to reawaken" maxlength="120" />
        <button class="btn">Spend {REAWAKEN_BLOOD} blood + 1 Willpower</button>
        <button type="button" class="btn quiet" onclick={() => (reawakening = false)}>Cancel</button>
      </form>
    {:else}
      <button class="linkish" onclick={() => (reawakening = true)}>Reawaken the body for the night…</button>
    {/if}
  {/if}
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
  .reawaken {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .reawaken input {
    flex: 1;
    min-width: 160px;
  }
  .linkish {
    background: none;
    border: none;
    padding: 0;
    margin-top: 6px;
    color: var(--ink-faint);
    text-decoration: underline dotted;
    font-size: 0.85rem;
    justify-self: start;
  }
  .thin {
    margin: 4px 0 0;
    font-size: 0.88rem;
    font-style: italic;
    color: var(--ink-soft);
  }
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
