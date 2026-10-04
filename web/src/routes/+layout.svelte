<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { session } from '$lib/session.svelte';
  import { apply, theme } from '$lib/theme.svelte';
  import ThemePicker from '$lib/components/ThemePicker.svelte';
  import { listenForKonami } from '$lib/konami';

  let { children } = $props();
  let whisper = $state<string | null>(null);
  let whisperTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    apply(theme.current);
    void session.load();
    return listenForKonami(() => {
      const mad = theme.toggleMalkavian();
      whisper = mad ? 'The Cobweb has noticed you.' : 'The voices quiet down. For now.';
      clearTimeout(whisperTimer);
      whisperTimer = setTimeout(() => (whisper = null), 3200);
    });
  });
</script>

<!-- An error page needs no session: a dead link shouldn't wait on Appwrite. -->
{#if session.ready || page.error}
  {@render children()}
{:else}
  <p class="loading">Lighting the candles…</p>
{/if}

{#if whisper}<p class="whisper" role="status">{whisper}</p>{/if}

<footer>
  <p class="skin"><ThemePicker /></p>
  <!-- Dark Pack: Paradox Interactive's fan-content programme. The logo and the notice below are what it asks for. -->
  <a class="darkpack" href="https://www.paradoxinteractive.com/games/world-of-darkness/community/dark-pack-agreement" rel="noopener" title="Made under the Dark Pack agreement">
    <img src="/dark-pack.png" alt="Dark Pack" width="56" height="56" />
  </a>
  Portions of the materials are the copyrights and trademarks of Paradox Interactive AB, and are used with
  permission. All rights reserved. For more information please visit
  <a href="https://www.worldofdarkness.com" rel="noopener">worldofdarkness.com</a>. This is a free, unofficial
  fan tool and is not published by Paradox Interactive or Onyx Path.
</footer>

<style>
  .loading {
    text-align: center;
    padding: 20vh 16px;
    font-style: italic;
    color: var(--ink-faint);
  }
  footer {
    max-width: 70ch;
    margin: 64px auto 32px;
    padding: 0 var(--gutter);
    font-size: 0.75rem;
    color: var(--ink-faint);
    text-align: center;
  }
  footer a {
    color: inherit;
  }
  .whisper {
    position: fixed;
    left: 50%;
    top: 30%;
    transform: translateX(-50%);
    z-index: 60;
    margin: 0;
    padding: 14px 22px;
    background: var(--screen);
    color: var(--screen-ink);
    font-style: italic;
    font-size: 1.2rem;
    letter-spacing: 0.04em;
    pointer-events: none;
    animation: whisper 3.2s ease both;
  }
  @keyframes whisper {
    0% { opacity: 0; filter: blur(4px); }
    15%, 75% { opacity: 1; filter: none; }
    100% { opacity: 0; filter: blur(2px); }
  }
  .darkpack {
    display: block;
    width: 56px;
    margin: 0 auto 10px;
  }
  .darkpack img {
    display: block;
    width: 56px;
    height: auto;
  }
  .skin {
    margin: 0 0 12px;
  }
</style>
