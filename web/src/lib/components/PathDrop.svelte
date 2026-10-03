<script lang="ts">
  /**
   * The beat after a failed degeneration check, in each skin's own idiom:
   * Camarilla's seal breaks, Classical marble cracks, the Dark Ages ink runs,
   * the Toreador quarterly prints a correction, Jazz Age gold tarnishes and
   * the Sabbat scores the mark. Same facts in every one: the Path, from, to.
   */
  import { theme } from '$lib/theme.svelte';

  let { name, path, from, to }: { name: string; path: string; from: number; to: number } = $props();

  const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const roman = (n: number) => ROMAN[n] ?? String(n);
  const KICKER: Record<string, string> = {
    camarilla: 'The seal breaks',
    classical: 'The marble cracks',
    darkages: 'The ink runs',
    toreador: 'A correction is printed',
    jazz: 'The gold tarnishes',
    sabbat: 'The mark is scored',
  };
  const first = $derived(name.split(' ')[0] || name);
</script>

<div class="drop {theme.id}">
  <p class="kicker">{KICKER[theme.id]}</p>

  {#if theme.id === 'classical'}
    <div class="stage">
      <span class="numeral old">{roman(from)}<svg class="crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="10,0 38,30 28,46 58,62 46,78 80,100" /></svg></span>
      <span class="numeral new">{roman(to)}</span>
      <span class="tesserae" aria-hidden="true">{#each Array(from) as _, i (i)}<i class:lost={i === to}></i>{/each}</span>
    </div>
    <p class="caption">A fracture runs through the inscribed numeral, and one tessera falls from the Via's mosaic.</p>
  {:else if theme.id === 'darkages'}
    <div class="stage">
      <span class="road">{path} —</span>
      <span class="ink old">{from}<i class="strike"></i><i class="blot"></i></span>
      <span class="ink new">{to}</span>
    </div>
    <p class="caption script">struck out in {first}'s own hand — the ink still wet</p>
  {:else if theme.id === 'toreador'}
    <div class="correction">
      <p class="tag">Correction</p>
      <p>In our last issue, {name}'s {path} was listed as <s>{from}</s>. It is <b>{to}</b>. We regret the error.</p>
    </div>
    <p class="caption">The loss arrives as a small, polite box in the margin. The politeness is the cruel part.</p>
  {:else if theme.id === 'jazz'}
    <div class="stage">
      <span class="diamonds" aria-hidden="true">{#each Array(from) as _, i (i)}<i class:lost={i === to}></i>{/each}</span>
      <span class="old">{from}</span>
      <span class="new">{to}</span>
    </div>
    <p class="caption">The lost diamond goes green-bronze like a cheap ring, and the ledger rewrites the total.</p>
  {:else if theme.id === 'sabbat'}
    <div class="stage">
      <span class="pips" aria-hidden="true">{#each Array(from) as _, i (i)}<i class:lost={i === to}></i>{/each}</span>
      <span class="new">{to}</span>
    </div>
    <p class="caption log">Deviation logged. {path} {from} → {to}.</p>
  {:else}
    <div class="stage">
      <span class="seal" aria-hidden="true"><i class="half left"></i><i class="half right"></i></span>
      <span class="old">{from}</span>
      <span class="new">{to}</span>
    </div>
    <p class="caption">The wax splits along a crack, both halves drift apart, and the number underneath is struck through.</p>
  {/if}
</div>

<style>
  .drop {
    display: grid;
    gap: 10px;
    margin: 4px 0;
  }
  .kicker {
    margin: 0;
    font-family: var(--caps);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 0.8rem;
    opacity: 0.85;
  }
  .stage {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    min-height: 90px;
  }
  .caption {
    margin: 0;
    font-style: italic;
    font-size: 0.95rem;
    opacity: 0.85;
    max-width: 52ch;
  }
  .old,
  .new {
    font-size: 3rem;
    line-height: 1;
    font-family: var(--display);
  }
  .old {
    position: relative;
    opacity: 0.55;
  }
  .new {
    color: #e04050;
    animation: arrive 0.6s 1.4s both;
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
  }

  /* Camarilla: the seal breaks. */
  .camarilla .old {
    font-size: 2.2rem;
    text-decoration: line-through;
    text-decoration-color: #e04050;
    text-decoration-thickness: 2px;
  }
  .seal {
    position: relative;
    width: 72px;
    height: 72px;
  }
  .half {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #c03a4a, #8b1e2d 55%, #6a1420);
    box-shadow: inset 0 0 0 5px #6a1420;
  }
  .half.left {
    clip-path: polygon(0 0, 52% 0, 44% 30%, 55% 55%, 46% 100%, 0 100%);
    animation: drift-left 1.6s 0.4s ease-out forwards;
  }
  .half.right {
    clip-path: polygon(52% 0, 100% 0, 100% 100%, 46% 100%, 55% 55%, 44% 30%);
    animation: drift-right 1.6s 0.4s ease-out forwards;
  }
  @keyframes drift-left {
    to {
      transform: translate(-9px, 4px) rotate(-14deg);
    }
  }
  @keyframes drift-right {
    to {
      transform: translate(9px, 6px) rotate(12deg);
    }
  }

  /* Classical: the marble cracks, a tessera falls. */
  .numeral {
    font-family: var(--display);
    font-size: 3.4rem;
    line-height: 1;
    position: relative;
  }
  .numeral.old {
    color: var(--screen-ink);
  }
  .numeral.new {
    color: #c48ab0;
    font-size: 2.4rem;
    animation: arrive 0.6s 1.4s both;
  }
  .crack {
    position: absolute;
    inset: -6% -10%;
    width: 120%;
    height: 112%;
  }
  .crack polyline {
    fill: none;
    stroke: #e04050;
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 200;
    stroke-dashoffset: 200;
    animation: draw 1s 0.3s ease-out forwards;
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  .tesserae {
    display: inline-flex;
    gap: 6px;
  }
  .tesserae i,
  .diamonds i {
    width: 10px;
    height: 10px;
    transform: rotate(45deg);
    background: var(--screen-ink);
  }
  .tesserae i.lost {
    animation: fall 1.4s 0.9s ease-in forwards;
  }
  @keyframes fall {
    to {
      transform: translate(6px, 46px) rotate(120deg);
      opacity: 0;
    }
  }

  /* Dark Ages: the ink runs. */
  .road {
    font-family: var(--display);
    font-size: 1.5rem;
  }
  .ink {
    font-family: var(--display);
    font-size: 3rem;
    line-height: 1;
    position: relative;
  }
  .ink.new {
    font-family: var(--script);
    color: #e2554a;
    font-size: 2.6rem;
    margin-left: -10px;
    transform: translateY(-14px);
    animation: arrive 0.6s 1.6s both;
  }
  .strike {
    position: absolute;
    left: -14%;
    top: 46%;
    height: 3px;
    width: 0;
    background: #b3261e;
    transform: rotate(-12deg);
    animation: stroke 0.5s 0.4s ease-out forwards;
  }
  @keyframes stroke {
    to {
      width: 128%;
    }
  }
  .blot {
    position: absolute;
    left: 38%;
    top: 60%;
    width: 14px;
    height: 18px;
    border-radius: 50% 50% 50% 50% / 40% 40% 60% 60%;
    background: #b3261e;
    opacity: 0;
    animation: run 1.6s 0.9s ease-in forwards;
  }
  @keyframes run {
    20% {
      opacity: 1;
    }
    to {
      opacity: 1;
      transform: translateY(18px) scaleY(1.3);
    }
  }
  .script {
    font-family: var(--script);
    font-style: normal;
    font-size: 1.25rem;
    color: #e2554a;
  }

  /* Toreador: a correction, politely. */
  .correction {
    background: #fff;
    color: #111;
    border: 1px solid #555;
    padding: 18px 20px;
    max-width: 440px;
    animation: arrive 0.6s 0.3s both;
  }
  .correction .tag {
    margin: 0 0 6px;
    font-family: var(--caps);
    text-transform: uppercase;
    letter-spacing: 0.24em;
    font-size: 0.75rem;
    color: #c0102a;
  }
  .correction p {
    margin: 0;
    font-family: var(--display);
    font-size: 1.3rem;
    line-height: 1.35;
  }
  .correction b {
    color: #c0102a;
    font-weight: 400;
  }
  .toreador .caption {
    font-style: normal;
  }

  /* Jazz Age: the gold tarnishes. */
  .diamonds {
    display: inline-flex;
    gap: 7px;
  }
  .diamonds i {
    width: 14px;
    height: 14px;
    background: #d4ad55;
  }
  .diamonds i.lost {
    animation: tarnish 1.4s 0.4s ease forwards;
  }
  @keyframes tarnish {
    to {
      background: #5d6b4a;
    }
  }
  .jazz .old {
    color: #d4ad55;
    font-size: 2rem;
  }
  .jazz .new {
    color: #d4ad55;
    font-size: 3.6rem;
  }

  /* Sabbat: the mark is scored. */
  .pips {
    display: inline-flex;
    gap: 5px;
    align-items: center;
  }
  .pips i {
    width: 12px;
    height: 12px;
    background: var(--screen-ink);
    position: relative;
  }
  .pips i.lost {
    background: transparent;
    animation: score 0.3s 0.5s both;
  }
  .pips i.lost::before,
  .pips i.lost::after {
    content: '';
    position: absolute;
    left: -3px;
    right: -3px;
    top: 50%;
    height: 2px;
    background: #e0202c;
  }
  .pips i.lost::before {
    transform: rotate(45deg);
  }
  .pips i.lost::after {
    transform: rotate(-45deg);
  }
  @keyframes score {
    from {
      opacity: 0;
    }
  }
  .sabbat .new {
    color: var(--screen-ink);
  }
  .log {
    font-family: var(--mono);
    font-style: normal;
    text-transform: uppercase;
    color: #e0202c;
    letter-spacing: 0.04em;
    font-size: 0.85rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .drop * {
      animation-duration: 0.01s !important;
      animation-delay: 0s !important;
    }
  }
</style>
