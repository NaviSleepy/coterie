<script lang="ts">
  /**
   * The moment a roll lands, its result across the top of the screen, for
   * the two people it matters to first: the player who rolled and the
   * Storyteller. Everyone else reads it in the feed, as always.
   */
  import { parseJson } from '$shared/codec.ts';
  import type { TableState } from '$lib/table.svelte';
  import { oldSport } from '$lib/oldsport.svelte';
  import Die from './Die.svelte';

  let { table }: { table: TableState } = $props();

  const SHOW_MS = 7000;
  const seen = new Set<string>();
  let shown = $state<any | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const mine = (r: any) => table.characters[r.characterId]?.ownerId === table.me;

  $effect(() => {
    const r = table.rolls.find((x) => table.fresh[x.$id] && !seen.has(x.$id));
    if (!r) return;
    seen.add(r.$id);
    // Degeneration has its own banner, and a roll on the roulette wheel has already been shown.
    if (r.kind === 'degeneration' || r.characterId === oldSport.holding) return;
    if (!mine(r) && !table.isStoryteller) return;
    shown = r;
    clearTimeout(timer);
    timer = setTimeout(() => (shown = null), SHOW_MS);
  });

  function verdict(r: any): string {
    if (r.refusal) return 'No dice';
    if (r.outcome === 'botch') return 'Botch';
    if (r.outcome === 'failure') return 'Failure';
    return r.netSuccesses === 1 ? '1 success' : `${r.netSuccesses} successes`;
  }
  const who = (r: any) => (mine(r) && !table.isStoryteller ? 'You' : (r.characterName?.split(' ')[0] ?? 'Someone'));
  const difficultyOf = (r: any) => r.revealedDifficulty ?? (table.isStoryteller ? (table.rollSecrets[r.$id]?.difficulty ?? null) : null);
</script>

{#if shown}
  {#key shown.$id}
    {@const r = shown}
    <div class="landed {r.outcome}" role="status" aria-live="polite">
      <span class="who"><b>{who(r)}</b> · {r.label}</span>
      <span class="dice" aria-label={`Dice: ${parseJson<{ value: number }[]>(r.dice, []).map((d) => d.value).join(', ')}`}>
        {#each parseJson<{ value: number; rerolled: boolean }[]>(r.dice, []) as d, i (i)}
          <Die value={d.value} rerolled={d.rerolled} difficulty={difficultyOf(r)} animate delay={i * 60} />
        {/each}
      </span>
      <span class="verdict">{verdict(r)}</span>
      {#if r.visibility === 'storyteller'}<span class="hidden">Behind the screen</span>{/if}
      <button class="close" onclick={() => (shown = null)} aria-label="Dismiss">×</button>
    </div>
  {/key}
{/if}

<style>
  .landed {
    position: sticky;
    top: 0;
    z-index: 18;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 10px var(--gutter);
    background: var(--screen);
    color: var(--screen-ink);
    border-bottom: 2px solid var(--gold);
    animation: drop 0.35s ease-out;
  }
  .landed.botch {
    border-bottom-color: var(--oxblood);
  }
  .who {
    font-size: 0.95rem;
  }
  .dice {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    color: var(--ink);
  }
  .verdict {
    margin-left: auto;
    font-family: var(--display);
    font-size: 1.35rem;
    font-style: italic;
  }
  .botch .verdict {
    color: #ff8a95;
  }
  .hidden {
    font-size: 0.8rem;
    font-style: italic;
    opacity: 0.75;
  }
  .close {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.3rem;
    line-height: 1;
    opacity: 0.8;
  }
  @keyframes drop {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .landed {
      animation: none;
    }
  }
</style>
