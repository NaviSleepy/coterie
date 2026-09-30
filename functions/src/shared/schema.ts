/**
 * The database, declared once. Functions import the table ids from here and
 * scripts/provision.ts builds the Appwrite project from the same object, so
 * the code and the schema can't drift apart.
 *
 * Appwrite 1.8 renamed collections → tables and documents → rows. The build
 * spec uses the old words; this file uses the new ones. Same thing.
 *
 * Appwrite has no JSON column type. Structured fields are `json` here and
 * stored as text; shared/codec.ts is the only place that parses them.
 */

export const DATABASE_ID = 'coterie';

export type Column =
  | { key: string; type: 'string'; size: number; required?: boolean; array?: boolean; default?: string }
  | { key: string; type: 'text' | 'json'; required?: boolean; array?: boolean }
  | { key: string; type: 'integer'; required?: boolean; min?: number; max?: number; default?: number }
  | { key: string; type: 'boolean'; required?: boolean; default?: boolean }
  | { key: string; type: 'datetime'; required?: boolean }
  | { key: string; type: 'enum'; elements: string[]; required?: boolean; default?: string };

export interface Index {
  key: string;
  type: 'key' | 'unique';
  columns: string[];
  orders?: ('ASC' | 'DESC')[];
}

export interface TableDef {
  id: string;
  name: string;
  /**
   * Table-level permissions. Almost everything is empty here: row security is
   * on everywhere and each row carries its own read list. `create` for users is
   * granted only where a client is allowed to write at all.
   */
  permissions: string[];
  columns: Column[];
  indexes: Index[];
}

const str = (key: string, size = 255, extra: Partial<Column> = {}): Column =>
  ({ key, type: 'string', size, ...extra }) as Column;
const int = (key: string, min?: number, max?: number, extra: Partial<Column> = {}): Column =>
  ({ key, type: 'integer', min, max, ...extra }) as Column;
const json = (key: string): Column => ({ key, type: 'json' });
const bool = (key: string, dflt = false): Column => ({ key, type: 'boolean', default: dflt });
const byChronicle: Index = { key: 'by_chronicle', type: 'key', columns: ['chronicleId'] };

export const TABLES = {
  chronicles: {
    id: 'chronicles',
    name: 'Chronicles',
    permissions: [],
    columns: [
      str('name', 120, { required: true }),
      str('storytellerId', 36, { required: true }),
      str('teamId', 36, { required: true }),
      { key: 'tenets', type: 'string', size: 280, array: true },
      str('currentSceneId', 36),
      str('inviteCode', 16, { required: true }),
      {
        key: 'botchRule',
        type: 'enum',
        elements: ['zero-with-a-one-is-a-botch', 'only-negative-is-a-botch'],
        default: 'zero-with-a-one-is-a-botch',
      },
      int('turnSerial', 0, undefined, { default: 0 }),
    ],
    indexes: [{ key: 'by_invite', type: 'unique', columns: ['inviteCode'] }],
  },

  /** Mechanical sheet. No client writes it — every field goes through a Function. */
  characters: {
    id: 'characters',
    name: 'Characters',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('ownerId', 36, { required: true }),
      str('clan', 60),
      str('sect', 60),
      str('sire', 120),
      int('generation', 4, 13, { required: true }),
      json('attributes'),
      json('abilities'),
      json('specialties'),
      json('disciplines'),
      json('backgrounds'),
      json('virtues'),
      json('merits'),
      json('flaws'),
      str('path', 80, { default: 'Humanity' }),
      int('pathRating', 0, 10, { default: 7 }),
      int('willpowerPermanent', 1, 10, { default: 5 }),
      int('willpowerTemporary', 0, 10, { default: 5 }),
      int('willpowerSpentTurnRef', undefined, undefined, { default: -1 }),
      int('bloodPool', 0, 50, { default: 0 }),
      int('bloodPoolMax', 1, 50, { default: 10 }),
      int('bloodPerTurn', 1, 10, { default: 1 }),
      int('bloodSpentThisTurn', 0, 10, { default: 0 }),
      int('bloodSpentTurnRef', undefined, undefined, { default: -1 }),
      int('healthBashing', 0, 7, { default: 0 }),
      int('healthLethal', 0, 7, { default: 0 }),
      int('healthAggravated', 0, 7, { default: 0 }),
      int('experienceTotal', 0, undefined, { default: 0 }),
      int('experienceSpent', 0, undefined, { default: 0 }),
      bool('difficultySealed'),
      int('version', 0, undefined, { default: 0 }),
    ],
    indexes: [byChronicle, { key: 'by_owner', type: 'key', columns: ['ownerId'] }],
  },

  /**
   * Cosmetic sheet, row id = character id. The one table a player writes
   * directly. It exists because Appwrite permissions are row-level: an owner
   * who can update the characters row can update bloodPool on it too. The spec
   * solved that problem for difficulties with rollSecrets; this is the same
   * move applied to the "cosmetic fields only" rule.
   */
  profiles: {
    id: 'profiles',
    name: 'Profiles',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('name', 120, { required: true }),
      str('concept', 160),
      str('nature', 60),
      str('demeanor', 60),
      { key: 'appearance', type: 'text' },
      { key: 'notes', type: 'text' },
      str('portrait', 2000),
    ],
    indexes: [byChronicle],
  },

  secrets: {
    id: 'secrets',
    name: 'Secrets',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('subjectCharacterId', 36),
      { key: 'body', type: 'text', required: true },
      { key: 'visibleTo', type: 'string', size: 36, array: true },
    ],
    indexes: [byChronicle],
  },

  /**
   * The wax seal on a secret, row id = secret id. Readable by the subject's
   * owner, who learns that something about them exists and how many others
   * hold it — never what it says.
   */
  seals: {
    id: 'seals',
    name: 'Seals',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('subjectCharacterId', 36, { required: true }),
      int('knownCount', 0, undefined, { default: 0 }),
    ],
    indexes: [byChronicle],
  },

  rolls: {
    id: 'rolls',
    name: 'Rolls',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('characterId', 36),
      str('characterName', 120),
      str('rollerId', 36, { required: true }),
      str('sceneId', 36),
      int('turn', 0, undefined, { default: 0 }),
      { key: 'kind', type: 'enum', elements: ['pool', 'degeneration', 'frenzy', 'rotschreck'], default: 'pool' },
      str('label', 120, { required: true }),
      int('basePool', 0, 60, { default: 0 }),
      int('woundPenalty', 0, 5, { default: 0 }),
      int('modifier', -30, 30, { default: 0 }),
      int('pool', 0, 60, { default: 0 }),
      json('dice'),
      int('rawSuccesses', 0, undefined, { default: 0 }),
      int('ones', 0, undefined, { default: 0 }),
      int('netSuccesses', -100, 100, { default: 0 }),
      bool('willpowerSpent'),
      { key: 'outcome', type: 'enum', elements: ['success', 'failure', 'botch'], required: true },
      { key: 'visibility', type: 'enum', elements: ['table', 'storyteller'], default: 'table' },
      str('refusal', 280),
      int('revealedDifficulty', 2, 10),
      str('note', 500),
    ],
    indexes: [byChronicle],
  },

  /** Row id = roll id. The number the dice were rolled against. */
  rollSecrets: {
    id: 'rollSecrets',
    name: 'Roll secrets',
    permissions: [],
    columns: [
      str('rollId', 36, { required: true }),
      str('chronicleId', 36, { required: true }),
      int('difficulty', 2, 10, { required: true }),
      bool('revealed'),
    ],
    indexes: [byChronicle],
  },

  /**
   * Row id = character id. The difficulty the Storyteller has set for that
   * character's next roll, which the player never reads. The character row's
   * difficultySealed flag tells the player an envelope exists.
   */
  sealedDifficulties: {
    id: 'sealedDifficulties',
    name: 'Sealed difficulties',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      int('difficulty', 2, 10, { required: true }),
      str('note', 160),
    ],
    indexes: [byChronicle],
  },

  scenes: {
    id: 'scenes',
    name: 'Scenes',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('name', 120, { required: true }),
      int('turn', 0, undefined, { default: 1 }),
      int('turnBase', 0, undefined, { default: 0 }),
      json('initiative'),
      { key: 'participants', type: 'string', size: 36, array: true },
      bool('active', true),
    ],
    indexes: [byChronicle],
  },

  /**
   * Row id = character id: at most one open proposal per sheet. A player's
   * edits to their own mechanical traits land here, never on the character
   * row; the Storyteller approves them into the sheet through the ledger.
   * `sheet` holds only the fields that differ from the sheet, as absolute
   * values. `revision` goes up on every edit, so an approval names the exact
   * draft the Storyteller looked at.
   */
  proposals: {
    id: 'proposals',
    name: 'Proposals',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('ownerId', 36, { required: true }),
      json('sheet'),
      int('revision', 1, undefined, { default: 1 }),
      int('baseVersion', 0, undefined, { default: 0 }),
      { key: 'status', type: 'enum', elements: ['pending', 'declined'], default: 'pending' },
      str('note', 280),
    ],
    indexes: [byChronicle],
  },

  /**
   * The table's reference library: merits, flaws, Disciplines, Backgrounds
   * and house rules as the Storyteller writes them up. Summaries are the
   * Storyteller's own words; the app ships no rulebook text. `page` is a
   * pointer into a book the reader owns, never its contents.
   */
  library: {
    id: 'library',
    name: 'Library',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      { key: 'kind', type: 'enum', elements: ['merit', 'flaw', 'discipline', 'background', 'rule'], required: true },
      str('name', 60, { required: true }),
      int('points', 1, 7),
      str('summary', 2000),
      str('page', 60),
    ],
    indexes: [byChronicle],
  },

  /** Clients create and heartbeat their own row. Table-level create for users. */
  presence: {
    id: 'presence',
    name: 'Presence',
    permissions: ['create("users")'],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('userId', 36, { required: true }),
      str('displayName', 120),
      { key: 'lastSeen', type: 'datetime', required: true },
    ],
    indexes: [byChronicle],
  },

  /**
   * The commit log for character state. Row id = `${characterId}.v${version}`,
   * so two writers racing from the same version collide on the primary key and
   * exactly one wins. See shared/mutate.ts.
   */
  ledger: {
    id: 'ledger',
    name: 'Ledger',
    permissions: [],
    columns: [
      str('chronicleId', 36, { required: true }),
      str('characterId', 36, { required: true }),
      int('version', 1, undefined, { required: true }),
      str('fn', 40, { required: true }),
      str('actorId', 36, { required: true }),
      str('summary', 500),
      json('patch'),
    ],
    indexes: [
      byChronicle,
      { key: 'by_character', type: 'key', columns: ['characterId', 'version'], orders: ['ASC', 'DESC'] },
    ],
  },
} as const satisfies Record<string, TableDef>;

export type TableId = keyof typeof TABLES;

/** Function ids, shared by provisioning, the web client and the .http specs. */
export const FUNCTIONS = [
  'chronicle',
  'character',
  'scene',
  'rollPool',
  'virtueCheck',
  'sealDifficulty',
  'revealRoll',
  'spendBlood',
  'applyDamage',
  'feedAndHeal',
  'createSecret',
  'revealSecret',
] as const;

export type FunctionId = (typeof FUNCTIONS)[number];
