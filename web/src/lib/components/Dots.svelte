<script lang="ts">
  let { value, max = 5, label = '' }: { value: number; max?: number; label?: string } = $props();
</script>

<span class="dots" role="img" aria-label={`${label ? label + ': ' : ''}${value} of ${max}`}>
  {#each Array(max) as _, i (i)}
    <span class:on={i < value}></span>
  {/each}
</span>

<style>
  .dots {
    display: inline-flex;
    align-items: center;
    gap: var(--pip-gap);
    flex-shrink: 0;
  }
  span span {
    width: var(--pip-size);
    height: var(--pip-size);
    border-radius: var(--pip-radius);
    transform: rotate(var(--pip-rotate));
    border: 1px solid var(--ink);
  }
  span span.on {
    background: var(--ink);
  }
</style>
