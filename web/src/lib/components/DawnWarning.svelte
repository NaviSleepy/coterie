<script lang="ts">
  /**
   * The half hour before this player's sunrise: a warm light creeps in from
   * the edges of the page, and a quiet banner counts down. Gone once the sun
   * is up. Location is a guess from the time zone unless the player shares
   * theirs, which stays in this browser.
   */
  import { onDestroy, onMount } from 'svelte';
  import { COORDS_KEY, dawnState, guessCoords, localCoords, type Coords, type DawnState } from '$lib/dawn';

  const DISMISSED = 'coterie-dawn-dismissed';

  let coords = $state<Coords>(guessCoords(undefined, 0));
  let dawn = $state<DawnState>({ minutes: null, progress: 0, sunrise: null });
  let dismissed = $state<string | null>(null);
  let locating = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = () => (dawn = dawnState(new Date(), coords));

  onMount(() => {
    coords = localCoords();
    try {
      dismissed = localStorage.getItem(DISMISSED);
    } catch {
      dismissed = null;
    }
    tick();
    timer = setInterval(tick, 20_000);
  });
  onDestroy(() => clearInterval(timer));

  function useLocation() {
    if (!navigator.geolocation) return;
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        // Two decimals is a neighbourhood, plenty for a sunrise.
        coords = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100, source: 'device' };
        try {
          localStorage.setItem(COORDS_KEY, JSON.stringify({ lat: coords.lat, lon: coords.lon }));
        } catch {
          // Kept for this visit only.
        }
        locating = false;
        tick();
      },
      () => (locating = false),
      { maximumAge: 86_400_000, timeout: 10_000 },
    );
  }

  function dismiss() {
    dismissed = dawn.sunrise?.toISOString() ?? null;
    try {
      if (dismissed) localStorage.setItem(DISMISSED, dismissed);
    } catch {
      // Dismissed for this visit.
    }
  }

  const showing = $derived(dawn.minutes !== null);
  const banner = $derived(showing && dismissed !== dawn.sunrise?.toISOString());
</script>

{#if showing}
  <div class="light" style:--dawn={dawn.progress} aria-hidden="true"></div>
{/if}
{#if banner}
  <div class="dawn" role="status" aria-live="polite">
    <p>
      <strong>The sky is lightening.</strong> Find your haven.
      <span class="left">{dawn.minutes === 0 ? 'Dawn is here.' : `Dawn in ${dawn.minutes} minute${dawn.minutes === 1 ? '' : 's'}.`}</span>
    </p>
    <div class="actions">
      {#if coords.source !== 'device'}
        <button class="linkish" onclick={useLocation} disabled={locating} title="Your sunrise is guessed from your time zone. Sharing your location makes it exact; it stays in this browser.">
          {locating ? 'Finding you…' : 'Not your sky? Use my location'}
        </button>
      {/if}
      <button class="close" onclick={dismiss} aria-label="Dismiss">×</button>
    </div>
  </div>
{/if}

<style>
  /* Morning at the edges of the page, stronger as sunrise nears. */
  .light {
    position: fixed;
    inset: 0;
    z-index: 15;
    pointer-events: none;
    background:
      radial-gradient(ellipse 120% 60% at 50% 115%, rgb(255 168 92 / calc(var(--dawn) * 0.4)), transparent 70%),
      linear-gradient(to top, rgb(255 196 130 / calc(var(--dawn) * 0.18)), transparent 40%);
    box-shadow: inset 0 0 calc(40px + var(--dawn) * 120px) rgb(255 170 90 / calc(0.15 + var(--dawn) * 0.35));
    transition: background 20s linear, box-shadow 20s linear;
  }
  .dawn {
    position: sticky;
    top: 0;
    z-index: 16;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 16px;
    padding: 9px var(--gutter);
    background: linear-gradient(90deg, color-mix(in oklab, var(--paper), #ffb066 30%), color-mix(in oklab, var(--paper), #ffd2a0 18%));
    color: var(--ink);
    border-bottom: 1px solid #d9893f;
    font-size: 0.95rem;
  }
  p {
    margin: 0;
  }
  .left {
    font-style: italic;
    color: var(--ink-soft);
    margin-left: 0.4em;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .linkish {
    background: none;
    border: none;
    padding: 0;
    color: var(--ink-soft);
    text-decoration: underline dotted;
    font-size: 0.85rem;
  }
  .close {
    margin-left: auto;
    background: none;
    border: none;
    font-size: 1.3rem;
    line-height: 1;
    color: var(--ink-soft);
  }
</style>
