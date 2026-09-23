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
    gap: 3px;
    flex-shrink: 0;
  }
  span span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--ink);
  }
  span span.on {
    background: var(--ink);
  }
</style>
