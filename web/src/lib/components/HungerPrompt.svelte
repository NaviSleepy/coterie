<script lang="ts">
  import type { Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();
  let rolling = $state(false);

  async function roll() {
    rolling = true;
    await table.act('virtueCheck', { characterId: character.$id, kind: 'frenzy', provocation: 'Hunger at zero blood' });
    rolling = false;
  }

  const virtue = $derived(character.virtues.instinct !== undefined ? 'Instinct' : 'Self-Control');
</script>

<section class="hunger" role="alert">
  <span class="label">At zero blood</span>
  <h2>The table will call for a hunger frenzy check</h2>
  <p>{virtue}, difficulty set by the Storyteller. The roll lands in everyone's feed; the difficulty stays sealed.</p>
  <button class="btn solid" onclick={roll} disabled={rolling}>Roll {virtue}</button>
</section>

<style>
  .hunger {
    border: 1px dashed color-mix(in oklab, var(--oxblood), transparent 30%);
    padding: 24px;
    display: grid;
    gap: 10px;
    justify-items: start;
  }
  .label {
    color: var(--gold);
  }
  h2 {
    margin: 0;
    font-style: italic;
    font-weight: 500;
    font-size: 1.6rem;
    line-height: 1.2;
  }
  p {
    margin: 0 0 14px;
    color: var(--ink-soft);
  }
</style>
