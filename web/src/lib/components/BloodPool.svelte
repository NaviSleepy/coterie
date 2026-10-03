<script lang="ts">
  /** Vials, one per point of the generation's ceiling. Thin blood's reserve is the bottom few: drawn dashed, kept for rising. */
  let { pool, max, small = false, flash = false, reserve = 0 }: { pool: number; max: number; small?: boolean; flash?: boolean; reserve?: number } =
    $props();
</script>

<div class="vials" class:small class:flash role="img" aria-label={`Blood pool ${pool} of ${max}${reserve ? `, ${reserve} kept for rising` : ''}`}>
  {#each Array(max) as _, i (i)}
    <span class:full={i < pool} class:reserved={i < reserve} class:last={i === pool - 1 && pool <= 2}></span>
  {/each}
</div>

<style>
  .vials {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  span {
    width: var(--vial-w);
    height: var(--vial-h);
    border: 1.5px solid var(--oxblood);
    border-radius: var(--vial-radius);
    transform: skewX(var(--vial-skew));
    transition:
      background 0.4s ease,
      box-shadow 0.4s ease;
  }
  .small span {
    width: calc(var(--vial-w) * 0.76);
    height: calc(var(--vial-h) * 0.79);
  }
  span.full {
    background: var(--oxblood);
  }
  span.reserved {
    border-style: dashed;
  }
  span.reserved.full {
    background: color-mix(in oklab, var(--oxblood), transparent 45%);
  }
  span.last {
    box-shadow: 0 0 10px 1px color-mix(in oklab, var(--oxblood), #ff3b4e 40%);
    background: color-mix(in oklab, var(--oxblood), #d7263d 45%);
  }
  .flash span {
    animation: correct 0.9s ease;
  }
  @keyframes correct {
    30% {
      border-color: var(--gold);
      transform: translateY(-2px);
    }
  }
</style>
