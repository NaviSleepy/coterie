<script lang="ts">
  import { theme } from '$lib/theme.svelte';
  let { size = 34, mark }: { size?: number; mark?: string } = $props();
</script>

<span class="seal" style:--s={`${size}px`} aria-hidden="true">
  {#if !mark && theme.id === 'daysleep'}
    <!-- Rem, half asleep: one glowing eye under a heavy lid. -->
    <svg class="eye" viewBox="0 0 24 24"><path d="M3.5 11 L11 12 Q11 17.5 7.1 17.5 Q3.5 17.5 3.5 11 Z M20.5 11 L13 12 Q13 17.5 16.9 17.5 Q20.5 17.5 20.5 11 Z" /></svg>
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
    background: radial-gradient(circle at 50% 45%, #1d1d23 60%, #0b0b0f);
    box-shadow: 0 0 0 2px #7d93e8, 0 0 12px rgb(159 196 240 / 0.35);
  }
  .eye {
    width: 84%;
    height: 84%;
    fill: #eaf8fc;
    filter: drop-shadow(0 0 2px rgb(200 240 255 / 0.9));
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
