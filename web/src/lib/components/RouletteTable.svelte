<script lang="ts">
  /**
   * The back-room roulette table. The dice were rolled on the server before
   * this opened; each spin brings the wheel round to the next one. Spin them
   * one at a time, or let it ride.
   */
  import Die from './Die.svelte';

  let {
    dice,
    verdict,
    oncollect,
    onretire,
  }: { dice: { value: number; rerolled?: boolean }[]; verdict: string; oncollect: () => void; onretire: () => void } = $props();

  // The wheel's pockets, 1 to 10, scattered like a real wheel. Ten is the house's gold pocket.
  const POCKETS = [10, 3, 8, 1, 6, 9, 4, 7, 2, 5];
  const STEP = 360 / POCKETS.length;
  const SPIN_MS = 2600;

  let turned = $state(0); // wheel rotation, degrees, only ever increasing
  let landed = $state<number[]>([]);
  let spinning = $state(false);
  let riding = $state(false);
  const done = $derived(landed.length === dice.length);

  function spin(): Promise<void> {
    if (spinning || done) return Promise.resolve();
    const value = dice[landed.length].value;
    const pocket = POCKETS.indexOf(value);
    // Bring that pocket to the pointer at the top, after a few full turns.
    const target = 360 - pocket * STEP;
    const base = turned - (turned % 360);
    turned = base + 360 * (3 + Math.floor(Math.random() * 2)) + target;
    spinning = true;
    return new Promise((resolve) =>
      setTimeout(() => {
        landed = [...landed, value];
        spinning = false;
        resolve();
      }, SPIN_MS),
    );
  }

  async function letItRide() {
    riding = true;
    while (!done) await spin();
    riding = false;
  }

  const colour = (n: number) => (n === 10 ? 'gold' : n % 2 ? 'red' : 'black');
</script>

<div class="room" role="dialog" aria-modal="true" aria-label="The back-room roulette table">
  <div class="table">
    <p class="kicker">The back room · roulette</p>
    <div class="wheel-wrap">
      <span class="pointer" aria-hidden="true"></span>
      <svg class="wheel" viewBox="-110 -110 220 220" style:transform={`rotate(${turned}deg)`} aria-hidden="true">
        <circle r="106" class="rim" />
        {#each POCKETS as n, i (n)}
          {@const a0 = ((i * STEP - STEP / 2 - 90) * Math.PI) / 180}
          {@const a1 = ((i * STEP + STEP / 2 - 90) * Math.PI) / 180}
          <path class="pocket {colour(n)}" d={`M0 0 L${96 * Math.cos(a0)} ${96 * Math.sin(a0)} A96 96 0 0 1 ${96 * Math.cos(a1)} ${96 * Math.sin(a1)} Z`} />
          <!-- 6 and 9 are underlined, as on a real wheel, so they read the right way up. -->
          <text
            text-decoration={n === 6 || n === 9 ? 'underline' : undefined}
            class="num"
            x={78 * Math.cos(((i * STEP - 90) * Math.PI) / 180)}
            y={78 * Math.sin(((i * STEP - 90) * Math.PI) / 180)}
            transform={`rotate(${i * STEP} ${78 * Math.cos(((i * STEP - 90) * Math.PI) / 180)} ${78 * Math.sin(((i * STEP - 90) * Math.PI) / 180)})`}>{n}</text
          >
        {/each}
        <circle r="40" class="hub" />
        <circle r="10" class="cap" />
      </svg>
      <span class="ball" class:rolling={spinning} aria-hidden="true"></span>
    </div>

    <div class="landed" aria-live="polite">
      {#each dice as d, i (i)}
        {#if i < landed.length}
          <Die value={d.value} rerolled={d.rerolled} animate />
        {:else}
          <span class="chip" class:next={i === landed.length}></span>
        {/if}
      {/each}
    </div>

    {#if done}
      <p class="verdict">{verdict}</p>
      <button class="btn solid" onclick={oncollect}>Collect</button>
    {:else}
      <div class="row">
        <button class="btn solid" onclick={() => void spin()} disabled={spinning || riding}>
          {spinning ? 'Round she goes…' : landed.length ? 'Spin again' : 'Spin'}
        </button>
        <button class="btn gold" onclick={() => void letItRide()} disabled={spinning || riding}>Let it ride</button>
      </div>
    {/if}
    <p class="house">The house already knows. The wheel only tells you.</p>
    <button class="retire" onclick={onretire}>Back to the dice</button>
  </div>
</div>

<style>
  .room {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: rgb(5 10 8 / 0.72);
    padding: 16px;
  }
  .table {
    width: min(440px, 100%);
    display: grid;
    justify-items: center;
    gap: 14px;
    padding: 24px 22px 18px;
    background:
      radial-gradient(ellipse at 50% 35%, #1b5a3f, #0f3a28 70%);
    border: 2px solid #d4ad55;
    box-shadow: inset 0 0 0 6px #0f3a28, inset 0 0 0 7px rgb(212 173 85 / 0.5), 0 20px 50px rgb(0 0 0 / 0.5);
    color: #f2e7c9;
    text-align: center;
  }
  .kicker {
    margin: 0;
    font-family: var(--caps);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 0.8rem;
    color: #e9cf8a;
  }
  .wheel-wrap {
    position: relative;
    width: min(260px, 70vw);
    aspect-ratio: 1;
  }
  .wheel {
    width: 100%;
    height: 100%;
    transition: transform 2.6s cubic-bezier(0.12, 0.7, 0.08, 1);
  }
  .rim {
    fill: #3a2410;
    stroke: #d4ad55;
    stroke-width: 3;
  }
  .pocket {
    stroke: #d4ad55;
    stroke-width: 0.8;
  }
  .pocket.red {
    fill: #a8232e;
  }
  .pocket.black {
    fill: #141210;
  }
  .pocket.gold {
    fill: #b98d2c;
  }
  .num {
    fill: #f2e7c9;
    font-family: var(--caps);
    font-weight: 700;
    font-size: 15px;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .hub {
    fill: #2a1a0c;
    stroke: #d4ad55;
    stroke-width: 2;
  }
  .cap {
    fill: #d4ad55;
  }
  .pointer {
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 9px solid transparent;
    border-right: 9px solid transparent;
    border-top: 16px solid #e9cf8a;
    z-index: 2;
    filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.5));
  }
  .ball {
    position: absolute;
    top: 9%;
    left: 50%;
    width: 13px;
    height: 13px;
    margin-left: -6.5px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, #cfcfcf 60%, #8a8a8a);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.6);
    z-index: 2;
  }
  .ball.rolling {
    animation: rattle 0.18s linear infinite;
  }
  @keyframes rattle {
    50% {
      transform: translate(1.5px, -1px);
    }
  }
  .landed {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
  }
  .chip {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 2px dashed rgb(212 173 85 / 0.5);
  }
  .chip.next {
    border-color: #e9cf8a;
  }
  .verdict {
    margin: 0;
    font-family: var(--display);
    font-size: 1.6rem;
    color: #e9cf8a;
  }
  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .house {
    margin: 0;
    font-size: 0.8rem;
    font-style: italic;
    opacity: 0.7;
  }
  .retire {
    background: none;
    border: none;
    color: #e9cf8a;
    font-size: 0.8rem;
    text-decoration: underline dotted;
    opacity: 0.8;
  }
  @media (prefers-reduced-motion: reduce) {
    .wheel {
      transition-duration: 0.3s;
    }
  }
</style>
