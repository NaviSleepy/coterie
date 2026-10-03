<script lang="ts">
  /** Each person's own skin for the table. Kept in this browser; nobody else sees your choice. */
  import { THEMES, theme, type ThemeId } from '$lib/theme.svelte';
</script>

<label class="picker">
  <span class="caps">Theme</span>
  <select value={theme.id} onchange={(e) => theme.set((e.currentTarget as HTMLSelectElement).value as ThemeId)} title={theme.current.mood}>
    {#each THEMES as t (t.id)}
      <option value={t.id}>{t.name}</option>
    {/each}
  </select>
</label>

<style>
  .picker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    color: inherit;
  }
  .caps {
    opacity: 0.8;
  }
  select {
    padding: 0.2em 0.4em;
    font-size: 0.9rem;
  }
</style>
