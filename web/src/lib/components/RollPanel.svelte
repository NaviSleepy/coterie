<script lang="ts">
  import { theme } from '$lib/theme.svelte';
  import {
    ABILITY_KEYS,
    ATTRIBUTE_KEYS,
    buildPool,
    isIncapacitated,
    specialtyApplies,
    traitLabel,
    woundLevel,
    woundPenalty,
  } from '$engine/index.ts';
  import { healthOf, sheetOf, type Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import WaxSeal from './WaxSeal.svelte';
  import RouletteTable from './RouletteTable.svelte';
  import { oldSport } from '$lib/oldsport.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();

  let attribute = $state('dexterity');
  let ability = $state('firearms');
  let useSpecialty = $state(false);
  let spendWillpower = $state(false);
  let rolling = $state(false);

  const sheet = $derived(sheetOf(character));
  const track = $derived(healthOf(character));
  const penalty = $derived(woundPenalty(track));
  const traits = $derived(ability ? [attribute, ability] : [attribute]);
  const built = $derived(buildPool(sheet, traits));
  const pool = $derived(built.ok ? Math.max(0, built.pool.basePool - penalty) : 0);
  const specialtyTrait = $derived(
    [ability, attribute].find((t) => t && specialtyApplies(sheet, t)) ?? null,
  );
  const willpowerUsed = $derived(table.turnRef >= 0 && character.willpowerSpentTurnRef === table.turnRef);
  const down = $derived(isIncapacitated(track));

  type Rolled = { dice: { value: number; rerolled?: boolean }[]; outcome: string; netSuccesses: number; refusal?: string | null };
  let wheel = $state<Rolled | null>(null);

  async function roll() {
    rolling = true;
    // In the back room the feed holds this roll back until the wheel has shown it.
    const toWheel = oldSport.active;
    if (toWheel) oldSport.holding = character.$id;
    const out = await table.act<Rolled>('rollPool', {
      characterId: character.$id,
      traits,
      specialty: useSpecialty && specialtyTrait ? specialtyTrait : undefined,
      spendWillpower,
    });
    if (toWheel && out?.dice?.length && !out.refusal) wheel = out;
    else oldSport.holding = null;
    spendWillpower = false;
    rolling = false;
  }

  const verdictOf = (r: Rolled) =>
    r.outcome === 'botch' ? 'Botch' : r.outcome === 'failure' ? 'Failure' : r.netSuccesses === 1 ? '1 success' : `${r.netSuccesses} successes`;

  function collect() {
    wheel = null;
    oldSport.holding = null;
  }
</script>

{#if wheel}
  <RouletteTable dice={wheel.dice} verdict={verdictOf(wheel)} oncollect={collect} onretire={() => { oldSport.lock(); collect(); }} />
{/if}

<section class="roll" aria-label="Next roll">
  <h2 class="label">{theme.words.rollPanel}</h2>

  <div class="pickers">
    <select bind:value={attribute} aria-label="Attribute">
      {#each ATTRIBUTE_KEYS as key (key)}<option value={key}>{traitLabel(key)} {character.attributes[key] ?? 1}</option>{/each}
    </select>
    <select bind:value={ability} aria-label="Ability">
      <option value="">— no Ability —</option>
      {#each ABILITY_KEYS as key (key)}<option value={key}>+ {traitLabel(key)} {character.abilities[key] ?? 0}</option>{/each}
    </select>
    {#if penalty}<span class="chip warn">− {woundLevel(track)} {penalty}</span>{/if}
    <span class="total">= {pool} {pool === 1 ? 'die' : 'dice'}</span>
  </div>

  <div class="envelope">
    <WaxSeal />
    {#if character.difficultySealed}
      <span>Difficulty <i>{theme.words.sealed}</i></span>
    {:else}
      <span>Standard difficulty <i>unless the Storyteller seals another</i></span>
    {/if}
  </div>

  <div class="options">
    {#if specialtyTrait}
      <label><input type="checkbox" bind:checked={useSpecialty} /> Specialty: {character.specialties.find((s) => s.trait === specialtyTrait)?.text}</label>
    {/if}
    <label title={willpowerUsed ? 'Already spent this turn' : undefined}>
      <input type="checkbox" bind:checked={spendWillpower} disabled={willpowerUsed || character.willpowerTemporary === 0} />
      Spend Willpower (+1 success)
    </label>
    <button class="btn solid" onclick={roll} disabled={rolling || down || !built.ok}>{rolling ? 'Rolling…' : theme.words.rollButton}</button>
  </div>
  {#if down}<p class="note">Incapacitated. The character cannot act.</p>{/if}
  {#if !built.ok}<p class="note">{built.message}</p>{/if}
</section>

<style>
  .roll {
    background: var(--screen);
    color: var(--screen-ink);
    padding: 24px;
    display: grid;
    gap: 16px;
  }
  .label {
    margin: 0;
    color: var(--gold-soft);
  }
  .pickers {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  select {
    background: transparent;
    color: var(--screen-ink);
    border: 1px solid var(--screen-rule);
  }
  option {
    color: var(--ink);
    background: var(--paper);
  }
  .chip {
    border: 1px solid var(--screen-rule);
    padding: 0.3em 0.6em;
  }
  .chip.warn {
    border-color: #a0404d;
    color: #efb9bf;
  }
  .total {
    font-style: italic;
    font-size: 1.3rem;
  }
  .envelope {
    display: flex;
    align-items: center;
    gap: 14px;
    border: 1px dashed color-mix(in oklab, var(--gold), transparent 45%);
    padding: 14px;
  }
  .envelope i {
    color: var(--gold-soft);
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 22px;
    align-items: center;
    justify-content: space-between;
  }
  .options label {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .options .btn {
    margin-left: auto;
    min-width: 7em;
    padding-block: 0.8em;
  }
  .note {
    margin: 0;
    font-style: italic;
    color: #efb9bf;
  }
</style>
