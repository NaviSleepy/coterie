<script lang="ts">
  import { theme } from '$lib/theme.svelte';
  let { size = 34, mark }: { size?: number; mark?: string } = $props();
</script>

<span class="seal" style:--s={`${size}px`} aria-hidden="true">
  {#if !mark && theme.id === 'daysleep'}
    <svg class="eye" viewBox="0 0 24 24"><path d="M4 10 Q12 17 20 10" /><path d="M6 12.5 L4.5 15 M9.5 14.2 L9 17 M14.5 14.2 L15 17 M18 12.5 L19.5 15" /></svg>
  {:else}{mark ?? theme.words.sealMark}{/if}
</span>

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
  /* Daysleep: a sleeping eye on a pale moon. */
  :global(:root[data-theme='daysleep']) .seal {
    border-radius: 50%;
    background: #f3ecd6;
    box-shadow: 0 0 14px rgb(243 236 214 / 0.3);
  }
  .eye {
    width: 70%;
    height: 70%;
    fill: none;
    stroke: #1b2148;
    stroke-width: 1.8;
    stroke-linecap: round;
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
