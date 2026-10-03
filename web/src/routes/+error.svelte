<script lang="ts">
  /**
   * Any page that doesn't exist, and anything that breaks. A 404 is a file the
   * Masquerade has already dealt with; the address you asked for survives only
   * as a redaction.
   */
  import { page } from '$app/state';

  const lost = $derived(page.status === 404);
  const path = $derived(page.url.pathname);
</script>

<svelte:head><title>{lost ? 'Destroyed' : 'Something went wrong'} · Coterie</title></svelte:head>

<main class="file panel">
  {#if lost}
    <p class="caps kicker">Case file N° {page.status}</p>
    <div class="stamp" aria-hidden="true">Destroyed</div>
    <h1>This page has been destroyed in accordance with the Masquerade.</h1>
    <p class="requested">
      <span class="caps">Requested</span>
      <code class="redacted" title="Redacted">{path}</code>
    </p>
    <div class="record" aria-hidden="true">
      <span style="width: 92%"></span>
      <span style="width: 78%"></span>
      <span style="width: 85%"></span>
      <span style="width: 40%"></span>
    </div>
    <p class="hint">No witnesses, no record, no page. If someone sent you this link, the Sheriff would like a word with them.</p>
  {:else}
    <p class="caps kicker">Error {page.status}</p>
    <h1>Something went wrong behind the screen.</h1>
    {#if page.error?.message}<p class="hint">{page.error.message}</p>{/if}
  {/if}
  <div class="row">
    <a class="btn solid" href="/">Return to the haven</a>
    <button class="btn quiet" onclick={() => history.back()}>Go back</button>
  </div>
</main>

<style>
  .file {
    position: relative;
    max-width: 720px;
    margin: 12vh auto 0;
    display: grid;
    gap: 16px;
    overflow: hidden;
  }
  .kicker {
    margin: 0;
    color: var(--ink-soft);
    letter-spacing: 0.12em;
  }
  h1 {
    margin: 0;
    font-weight: 500;
    font-size: clamp(1.7rem, 4.2vw, 2.5rem);
    line-height: 1.15;
    max-width: 22ch;
  }
  .stamp {
    position: absolute;
    top: 26px;
    right: -6px;
    padding: 6px 18px;
    border: 3px double var(--oxblood);
    color: var(--oxblood);
    font-family: var(--caps);
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-weight: 700;
    font-size: 1.05rem;
    transform: rotate(9deg);
    opacity: 0.85;
    animation: stamp 0.45s 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: rotate(9deg) scale(1.8);
    }
  }
  .requested {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
    color: var(--ink-soft);
  }
  .redacted {
    font-family: var(--mono);
    background: var(--ink);
    color: transparent;
    padding: 0 6px;
    max-width: 100%;
    overflow-wrap: anywhere;
    user-select: none;
  }
  .record {
    display: grid;
    gap: 9px;
    padding: 6px 0;
  }
  .record span {
    display: block;
    height: 14px;
    background: var(--ink);
    transform-origin: left;
    animation: redact 0.5s ease-out both;
  }
  .record span:nth-child(2) {
    animation-delay: 0.12s;
  }
  .record span:nth-child(3) {
    animation-delay: 0.24s;
  }
  .record span:nth-child(4) {
    animation-delay: 0.36s;
  }
  @keyframes redact {
    from {
      transform: scaleX(0);
    }
  }
  .hint {
    margin: 0;
    color: var(--ink-soft);
    font-style: italic;
  }
  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  @media (max-width: 520px) {
    .stamp {
      position: static;
      justify-self: start;
      transform: rotate(-4deg);
    }
  }
</style>
