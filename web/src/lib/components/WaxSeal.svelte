<script lang="ts">
  import { theme } from '$lib/theme.svelte';
  let { size = 34, mark }: { size?: number; mark?: string } = $props();
</script>

<span class="seal" style:--s={`${size}px`} aria-hidden="true">{mark ?? theme.words.sealMark}</span>

<style>
  .seal {
    width: var(--s);
    height: var(--s);
    flex-shrink: 0;
    display: inline-grid;
    place-items: center;
    border-radius: 47% 53% 50% 50% / 52% 48% 52% 48%;
    background: radial-gradient(circle at 35% 30%, #c03a4a, var(--oxblood) 55%, var(--oxblood-deep));
    box-shadow:
      inset 0 0 0 calc(var(--s) * 0.09) color-mix(in oklab, var(--oxblood-deep), black 10%),
      inset 0 0 0 calc(var(--s) * 0.12) #b43645,
      0 2px 4px rgb(0 0 0 / 0.25);
    color: #f6dcd5;
    font-style: italic;
    font-size: calc(var(--s) * 0.42);
    font-family: var(--serif);
  }
  /* Jazz Age: the Storyteller's chip, red with a white-dashed rim. */
  :global(:root[data-theme='jazz']) .seal {
    border-radius: 50%;
    background: radial-gradient(circle, #b3242f 0 52%, transparent 53%), repeating-conic-gradient(#b3242f 0 22deg, #f2e7c9 22deg 30deg);
    box-shadow: 0 0 0 1px #6e141b, 0 2px 4px rgb(0 0 0 / 0.4);
    font-style: normal;
    font-family: var(--caps);
    font-weight: 700;
    font-size: calc(var(--s) * 0.3);
  }
</style>
