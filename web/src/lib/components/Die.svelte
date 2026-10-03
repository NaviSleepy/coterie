<script lang="ts">
  /**
   * One d10. Before the difficulty is known the die can only say what it is;
   * a 1 always reads as a 1 because ones cancel regardless of difficulty.
   */
  let {
    value,
    rerolled = false,
    difficulty = null,
    delay = 0,
    animate = false,
  }: { value: number; rerolled?: boolean; difficulty?: number | null; delay?: number; animate?: boolean } = $props();

  const kind = $derived(
    value === 1 ? 'one' : difficulty !== null && value >= difficulty ? 'hit' : value === 10 ? 'ten' : 'plain',
  );
</script>

<span class="die {kind}" class:rerolled class:animate style:animation-delay={`${delay}ms`} title={rerolled ? 'Specialty reroll' : undefined}>
  {value}
</span>

<style>
  .die {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--ink-faint);
    border-radius: var(--die-radius);
    background: var(--paper);
    font-variant-numeric: lining-nums;
    font-size: 0.95rem;
  }
  .one {
    background: var(--oxblood);
    color: #fbeee6;
    border-color: var(--oxblood);
  }
  .ten {
    border: 2px solid var(--gold);
    font-weight: 600;
  }
  .hit {
    border: 1.5px solid var(--ink);
    font-weight: 600;
  }
  .rerolled {
    border-style: dashed;
  }
  .animate {
    animation: land 0.55s cubic-bezier(0.2, 0.8, 0.3, 1.2) backwards;
  }
  @keyframes land {
    0% {
      transform: translateY(-14px) rotate(-18deg);
      opacity: 0;
    }
    60% {
      transform: translateY(2px) rotate(4deg);
      opacity: 1;
    }
  }
</style>
