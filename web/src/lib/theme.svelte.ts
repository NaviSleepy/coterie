/**
 * Six skins for the same table. Each person picks their own; it lives in this
 * browser only (nothing about a theme reaches the server). A skin is a set of
 * CSS tokens under [data-theme] in app.css, the fonts it needs, and a little
 * lexicon: what the blood pool, the roll and the feed are called in its world.
 */

export type ThemeId = 'camarilla' | 'classical' | 'darkages' | 'toreador' | 'jazz' | 'sabbat' | 'daysleep' | 'malkavian';

export interface Lexicon {
  blood: string;
  rollPanel: string;
  rollButton: string;
  feed: string;
  /** "Difficulty ___": where the Storyteller keeps the number. */
  sealed: string;
  sealMark: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  /** One line for the picker. */
  mood: string;
  dark: boolean;
  /** Google Fonts css2 families, beyond the Cormorant every page loads. */
  fonts: string | null;
  words: Lexicon;
  /** Not in the picker until found (the Malkavian skin: the Konami code). Never saved. */
  hidden?: boolean;
}

const GOOGLE = 'https://fonts.googleapis.com/css2?display=swap&';

export const THEMES: Theme[] = [
  {
    id: 'camarilla',
    name: 'Camarilla',
    mood: 'Candlelight and gold leaf',
    dark: false,
    fonts: null,
    words: { blood: 'Blood Pool', rollPanel: 'Next roll', rollButton: 'Roll', feed: 'The night so far', sealed: 'sealed by the Storyteller', sealMark: 'St' },
  },
  {
    id: 'classical',
    name: 'Classical',
    mood: 'Marble, terracotta and Tyrian purple',
    dark: false,
    fonts: 'family=Cinzel:wght@400;600;700',
    words: { blood: 'Vitae', rollPanel: 'The augury', rollButton: 'Cast', feed: 'The annals', sealed: "under the Storyteller's signet", sealMark: 'S' },
  },
  {
    id: 'darkages',
    name: 'Dark Ages',
    mood: 'Parchment, red wax and a cold crypt',
    dark: false,
    fonts: 'family=Playfair+Display:wght@500;700&family=Cinzel:wght@500;600&family=Caveat:wght@500',
    words: { blood: 'Vitae', rollPanel: 'The galvanic apparatus', rollButton: 'Throw the switch', feed: 'Laboratory journal', sealed: "under the Storyteller's red wax", sealMark: 'S' },
  },
  {
    id: 'toreador',
    name: 'Toreador',
    mood: 'A fashion quarterly: Didone, white space, one crimson',
    dark: false,
    fonts: 'family=Bodoni+Moda:ital,wght@0,500;0,700;1,500&family=Jost:wght@400;500;600',
    words: { blood: 'Blood', rollPanel: "Tonight's performance", rollButton: 'Perform', feed: "The critics' column", sealed: 'kept by the Storyteller, unseen by the critics', sealMark: 'T' },
  },
  {
    id: 'jazz',
    name: 'Jazz Age',
    mood: 'Black lacquer, gold deco and green felt',
    dark: true,
    fonts: 'family=Limelight&family=Josefin+Sans:wght@400;600;700',
    words: { blood: 'Blood Pool', rollPanel: 'The back-room table', rollButton: 'Shoot', feed: 'The ledger', sealed: "face down under the Storyteller's chip", sealMark: 'ST' },
  },
  {
    id: 'sabbat',
    name: 'Sabbat',
    mood: 'Bone, blackletter and a red that was scored in',
    dark: true,
    fonts: 'family=Pirata+One&family=Courier+Prime:wght@400;700&family=Crimson+Pro:ital,wght@0,400;0,600;1,400',
    words: { blood: 'Vitae', rollPanel: 'The rite', rollButton: 'Strike', feed: 'War party log', sealed: 'held by the Priest', sealMark: 'S' },
  },
  {
    id: 'daysleep',
    name: 'Daysleep',
    mood: "Rem's dream stowaway: midnight navy, a periwinkle nightcap, starlight and counting sheep",
    dark: true,
    fonts: 'family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600;1,9..144,700&family=Nunito:wght@400;600;700',
    words: { blood: 'Blood', rollPanel: 'Counting sheep', rollButton: 'Drift off', feed: 'Dream journal', sealed: 'kept by the Storyteller while you sleep', sealMark: '' },
  },
  {
    id: 'malkavian',
    name: 'Malkavian (?)',
    mood: 'Everything slightly wrong, on purpose',
    dark: false,
    fonts: 'family=Special+Elite',
    hidden: true,
    words: {
      blood: 'Blood Pond',
      rollPanel: 'The next roll (probably)',
      rollButton: 'Ask nicely',
      feed: 'Things that happened, allegedly',
      sealed: "hidden where even the Storyteller can't find it",
      sealMark: '?',
    },
  },
];

const KEY = 'coterie-theme';
const FONTS_KEY = 'coterie-theme-fonts';
const byId = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0];

function read(): ThemeId {
  try {
    const t = byId(localStorage.getItem(KEY));
    return t.hidden ? 'camarilla' : t.id;
  } catch {
    return 'camarilla';
  }
}

class ThemeState {
  id = $state<ThemeId>(typeof localStorage === 'undefined' ? 'camarilla' : read());
  get current(): Theme {
    return byId(this.id);
  }
  get words(): Lexicon {
    return this.current.words;
  }

  /** The theme to return to when the Malkavian visit ends. */
  private sane: ThemeId = 'camarilla';

  /** The Konami code: in, and out again. The Malkavian skin is for this visit only. */
  toggleMalkavian(): boolean {
    if (this.id === 'malkavian') {
      this.id = this.sane;
      apply(byId(this.sane));
      return false;
    }
    this.sane = this.id;
    this.id = 'malkavian';
    apply(byId('malkavian'));
    return true;
  }

  set(id: ThemeId) {
    if (byId(id).hidden) return;
    this.id = id;
    apply(byId(id));
    try {
      localStorage.setItem(KEY, id);
      const t = byId(id);
      if (t.fonts) localStorage.setItem(FONTS_KEY, GOOGLE + t.fonts);
      else localStorage.removeItem(FONTS_KEY);
    } catch {
      // Private windows: the theme lasts for this visit.
    }
  }
}

/** Sets the page's theme and loads its fonts. app.html does the same before first paint. */
export function apply(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = t.id;
  document.documentElement.style.colorScheme = t.dark ? 'dark' : 'light';
  let link = document.getElementById('theme-fonts') as HTMLLinkElement | null;
  if (!t.fonts) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.id = 'theme-fonts';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = GOOGLE + t.fonts;
}

export const theme = new ThemeState();
