/**
 * "Old Sport": a Jazz Age secret. Typing the phrase into your private notes
 * while the Jazz Age skin is on opens the back room: your rolls come to a
 * roulette table you spin by hand. The server still rolls every die; the
 * wheel only reveals them. Kept in this browser.
 */
import { theme } from './theme.svelte';

const KEY = 'coterie-old-sport';
export const PHRASE = /old sport/gi;

/** How many times the phrase appears: a new one is what opens the back room. */
export const countPhrase = (text: string) => (text.match(PHRASE) ?? []).length;

class OldSport {
  unlocked = $state(read());
  /** The character whose roll is on the wheel; the feed holds that roll back until it's collected. */
  holding = $state<string | null>(null);

  /** Roulette only in the Jazz Age skin. */
  get active() {
    return this.unlocked && theme.id === 'jazz';
  }
  unlock() {
    this.unlocked = true;
    write(true);
  }
  lock() {
    this.unlocked = false;
    write(false);
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function write(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // For this visit only.
  }
}

export const oldSport = new OldSport();
