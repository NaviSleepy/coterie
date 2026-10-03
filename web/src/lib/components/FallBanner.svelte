<script lang="ts">
  /**
   * When a degeneration check lands, the whole table hears it: a banner across
   * the top for a fall, a quieter one when the character holds. It reads the
   * roll as it arrives live, so it never replays old rolls on page load.
   */
  import type { TableState } from '$lib/table.svelte';

  let { table }: { table: TableState } = $props();

  const SHOW_MS = 9000;
  const seen = new Set<string>();
  let shown = $state<{ id: string; who: string; path: string; rating: number; fell: boolean } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** "… — Humanity falls to 5" or "… — Humanity holds at 6": the change, as the server wrote it. */
  function change(note: string | null | undefined) {
    const m = /— (.+) (falls to|holds at) (\d+)$/.exec(note ?? '');
    return m ? { path: m[1], fell: m[2] === 'falls to', rating: Number(m[3]) } : null;
  }

  $effect(() => {
    const r = table.rolls.find((x) => x.kind === 'degeneration' && table.fresh[x.$id] && !seen.has(x.$id));
    if (!r) return;
    seen.add(r.$id);
    const c = change(r.note);
    if (!c) return;
    shown = { id: r.$id, who: (r.characterName as string)?.split(' ')[0] ?? 'Someone', ...c };
    clearTimeout(timer);
    timer = setTimeout(() => (shown = null), SHOW_MS);
  });
</script>

{#if shown}
  {#key shown.id}
    <div class="fall" class:held={!shown.fell} role="status" aria-live="assertive">
      {#if shown.fell}
        <span><b>{shown.who}'s {shown.path} falls to {shown.rating}.</b></span>
      {:else}
        <span>{shown.who} held. {shown.path} stays at {shown.rating}.</span>
      {/if}
      <button onclick={() => (shown = null)} aria-label="Dismiss">×</button>
    </div>
  {/key}
{/if}

<style>
  .fall {
    position: sticky;
    top: 0;
    z-index: 19;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    padding: 12px var(--gutter);
    background: var(--oxblood-deep);
    color: var(--paper);
    font-size: 1.2rem;
    letter-spacing: 0.02em;
    animation: drop 0.5s ease-out;
  }
  .fall.held {
    background: var(--screen);
    color: var(--screen-ink);
    font-size: 1.05rem;
    font-style: italic;
  }
  button {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
  }
  @keyframes drop {
    from { transform: translateY(-100%); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .fall { animation: none; }
  }
</style>
