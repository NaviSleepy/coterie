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
    align-items: center;
    gap: 3px;
  }
  .row:first-child {
    gap: var(--pip-gap);
  }
  .dot,
  .sq {
    width: 10px;
    height: 10px;
    border: 1px solid var(--ink);
  }
  .dot {
    width: var(--pip-size);
    height: var(--pip-size);
    border-radius: var(--pip-radius);
    transform: rotate(var(--pip-rotate));
  }
  .on {
    background: var(--ink);
  }
  .sq.cap {
    border-color: var(--rule);
  }
</style>
