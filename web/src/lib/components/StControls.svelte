<script lang="ts">
  /** The Storyteller's hands on one character: seal, wound, feed, test, adjust. */
  import type { Character } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import HealthTrack from './HealthTrack.svelte';
  import SheetEditor from './SheetEditor.svelte';
  import { healthOf } from '$shared/codec.ts';
  import { changesFrom, describe, draftOf, type Draft } from '$lib/sheet-edit';

  let { table, character, onclose }: { table: TableState; character: Character; onclose: () => void } = $props();

  let difficulty = $state(6);
  let feedAmount = $state(2);
  let sin = $state('');
  let degenDifficulty = $state(7);
  let hiddenPool = $state(3);
  let hiddenLabel = $state('Perception + Alertness');
  let hiddenDifficulty = $state(7);
  let xp = $state(0);

  // Direct edits: the Storyteller's changes go straight to the sheet, through the ledger.
  let draft = $state<Draft | null>(null);
  const changes = $derived(draft ? changesFrom(character, draft) : {});
  const lines = $derived(draft ? describe(character, changes) : []);

  async function saveSheet() {
    const out = await table.act('character', { action: 'adjust', characterId: character.$id, sheet: changes });
    if (out) draft = null;
  }
</script>

<section class="controls panel">
  <header>
    <h2>{table.nameOf(character.$id)}</h2>
    <button class="btn quiet" onclick={onclose}>Close</button>
  </header>

  <div class="grid">
    <div class="block">
      <h3 class="label">Seal a difficulty</h3>
      <p class="hint">The player sees a sealed envelope. Their next roll uses it.</p>
      <div class="row">
        <input type="number" min="2" max="10" bind:value={difficulty} aria-label="Difficulty" />
        <button class="btn solid" onclick={() => table.act('sealDifficulty', { characterId: character.$id, difficulty })}>Seal</button>
        {#if character.difficultySealed}
          <button class="btn quiet" onclick={() => table.act('sealDifficulty', { characterId: character.$id, clear: true })}>Clear</button>
        {/if}
      </div>
    </div>

    <div class="block">
      <h3 class="label">Health</h3>
      <HealthTrack
        track={healthOf(character)}
        flash={table.isFlashing(`${character.$id}:health`)}
        onmark={(type) => table.damage(character.$id, 1, type).catch(() => {})}
        onunmark={(type) => table.damage(character.$id, -1, type).catch(() => {})}
      />
    </div>

    <div class="block">
      <h3 class="label">Feeding</h3>
      <div class="row">
        <input type="number" min="1" max="50" bind:value={feedAmount} aria-label="Blood gained" />
        <button class="btn" onclick={() => table.act('feedAndHeal', { characterId: character.$id, bloodGained: feedAmount })}>Add blood</button>
        <button class="btn quiet" disabled={character.healthAggravated === 0 || character.bloodPool < 5}
          onclick={() => table.act('feedAndHeal', { characterId: character.$id, healAggravated: 1 })}>Heal 1 aggravated (5)</button>
      </div>
    </div>

    <div class="block">
      <h3 class="label">Behind the screen</h3>
      <div class="row">
        <input class="wide" bind:value={hiddenLabel} aria-label="Roll label" />
        <input type="number" min="0" max="40" bind:value={hiddenPool} aria-label="Dice" />
        <span>vs</span>
        <input type="number" min="2" max="10" bind:value={hiddenDifficulty} aria-label="Difficulty" />
        <button class="btn" onclick={() => table.act('rollPool', {
          characterId: character.$id, basePool: hiddenPool, label: hiddenLabel, difficulty: hiddenDifficulty, visibility: 'storyteller',
        })}>Roll hidden</button>
      </div>
    </div>

    <div class="block">
      <h3 class="label">Degeneration</h3>
      <p class="hint">Logged to the feed with the sin. A failure costs a point of {character.path}, and the table sees it fall.</p>
      <textarea bind:value={sin} rows="2" placeholder="The sin that calls for it"></textarea>
      <div class="row">
        <input type="number" min="2" max="10" bind:value={degenDifficulty} aria-label="Difficulty" />
        <button class="btn solid" disabled={!sin.trim()} onclick={async () => {
          const ok = await table.act('virtueCheck', { characterId: character.$id, kind: 'degeneration', sin, difficulty: degenDifficulty });
          if (ok) sin = '';
        }}>Call for the check</button>
      </div>
      <div class="row">
        <button class="btn quiet" onclick={() => table.act('virtueCheck', { characterId: character.$id, kind: 'frenzy', difficulty })}>Frenzy check</button>
        <button class="btn quiet" onclick={() => table.act('virtueCheck', { characterId: character.$id, kind: 'rotschreck', difficulty })}>Rötschreck</button>
      </div>
    </div>

    <div class="block">
      <h3 class="label">Experience</h3>
      <p class="hint">{character.experienceTotal} earned · {character.experienceSpent} spent</p>
      <div class="row">
        <input type="number" min="1" max="20" bind:value={xp} aria-label="Experience to award" />
        <button class="btn" disabled={xp < 1} onclick={() => table.act('character', {
          action: 'adjust', characterId: character.$id, sheet: { experienceTotal: character.experienceTotal + xp },
        })}>Award</button>
      </div>
    </div>
  </div>

  <div class="block sheet-edit">
    <div class="row between">
      <h3 class="label">Sheet</h3>
      {#if draft}
        <div class="row">
          <button class="btn solid" disabled={lines.length === 0} onclick={saveSheet}>Save {lines.length || ''} change{lines.length === 1 ? '' : 's'}</button>
          <button class="btn quiet" onclick={() => (draft = null)}>Cancel</button>
        </div>
      {:else}
        <button class="btn" onclick={() => (draft = draftOf(character))}>Edit traits, merits and flaws</button>
      {/if}
    </div>
    {#if draft}
      {#if lines.length}<ul class="lines">{#each lines as l (l)}<li>{l}</li>{/each}</ul>{/if}
      <SheetEditor bind:draft />
    {/if}
  </div>
</section>

<style>
  .between {
    justify-content: space-between;
    align-items: center;
  }
  .lines {
    margin: 0;
    padding-left: 1.2em;
    columns: 2 200px;
  }
  .controls {
    display: grid;
    gap: 18px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-weight: 500;
    font-size: 1.7rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 24px;
  }
  .block {
    display: grid;
    gap: 8px;
    align-content: start;
  }
  h3 {
    margin: 0;
  }
  .hint {
    margin: 0;
    font-style: italic;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  input[type='number'] {
    width: 4.5em;
  }
  input.wide {
    flex: 1;
    min-width: 10em;
  }
</style>
