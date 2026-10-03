<script lang="ts">
  /** "Export PDF": the character on the V20 sheet, filled in the browser. */
  import type { Character } from '$shared/codec.ts';
  import { exportSheet } from '$lib/export-sheet';
  import type { TableState } from '$lib/table.svelte';

  let { table, character }: { table: TableState; character: Character } = $props();
  let busy = $state(false);

  async function run() {
    busy = true;
    table.error = null;
    try {
      await exportSheet(table, character, table.sheetTemplate);
    } catch (e) {
      console.error('export failed', e);
      const code = (e as { code?: number })?.code;
      table.error = code === 401 || code === 404
        ? 'The blank character sheet isn’t available to you. Ask whoever runs this Coterie to upload it to the sheet-templates bucket.'
        : 'Could not build the PDF. Try again.';
    } finally {
      busy = false;
    }
  }
</script>

<button class="linkish" onclick={run} disabled={busy}>{busy ? 'Building PDF…' : 'Export PDF'}</button>
