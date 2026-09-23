<script lang="ts">
  let { permanent, temporary }: { permanent: number; temporary: number } = $props();
</script>

<div class="wp" role="img" aria-label={`Willpower ${temporary} of ${permanent}, permanent ${permanent}`}>
  <div class="row">
    {#each Array(10) as _, i (i)}<span class="dot" class:on={i < permanent}></span>{/each}
  </div>
  <div class="row">
    {#each Array(10) as _, i (i)}<span class="sq" class:on={i < temporary} class:cap={i >= permanent}></span>{/each}
  </div>
</div>

<style>
  .wp {
    display: grid;
    gap: 4px;
  }
  .row {
    display: flex;
    gap: 3px;
  }
  .dot,
  .sq {
    width: 10px;
    height: 10px;
    border: 1px solid var(--ink);
  }
  .dot {
    border-radius: 50%;
  }
  .on {
    background: var(--ink);
  }
  .sq.cap {
    border-color: var(--rule);
  }
</style>
