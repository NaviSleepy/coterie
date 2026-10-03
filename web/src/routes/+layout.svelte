<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { session } from '$lib/session.svelte';
  import { apply, theme } from '$lib/theme.svelte';
  import ThemePicker from '$lib/components/ThemePicker.svelte';

  let { children } = $props();
  onMount(() => {
    apply(theme.current);
    void session.load();
  });
</script>

<!-- An error page needs no session: a dead link shouldn't wait on Appwrite. -->
{#if session.ready || page.error}
  {@render children()}
{:else}
  <p class="loading">Lighting the candles…</p>
{/if}

<footer>
  <p class="skin"><ThemePicker /></p>
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
  .skin {
    margin: 0 0 12px;
  }
</style>
