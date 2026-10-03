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
    width: 17px;
    height: 24px;
    border: 1.5px solid var(--oxblood);
    border-radius: 2px 2px 9px 9px;
    transition:
      background 0.4s ease,
      box-shadow 0.4s ease;
  }
  .small span {
    width: 13px;
    height: 19px;
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
