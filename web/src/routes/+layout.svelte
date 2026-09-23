<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { session } from '$lib/session.svelte';

  let { children } = $props();
  onMount(() => void session.load());
</script>

{#if session.ready}
  {@render children()}
{:else}
  <p class="loading">Lighting the candles…</p>
{/if}

<footer>
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
</style>
