# Coterie

A realtime shared table for **Vampire: The Masquerade 20th Anniversary Edition**: character sheets, blood pool, dice and a Storyteller's screen, synced live across everyone in the chronicle.

The threat model is the players themselves. Every number that matters is either a secret someone shouldn't see or a roll someone would love to fudge. Two properties fall out of that, and the rest of the design follows from them:

- **Server-authoritative dice.** If the client rolls, the client can lie. The client never rolls. It never even says how many dice.
- **Row-level disclosure.** The Storyteller, a character's owner and the rest of the coterie are each entitled to a different slice of the same game. The Masquerade is an access-control model, and Appwrite's row permissions enforce it: the client never filters a secret, because it is never sent one.

```
engine/      V20 rules arithmetic. Pure TypeScript, no I/O. Dice, wounds, blood, traits.
functions/   Twelve Appwrite Functions — the only writers of anything with stakes.
web/         SvelteKit single-page app. Reads with the player's own session; writes via Functions.
scripts/     provision.ts builds an Appwrite project from the schema; security-fixture.ts seeds staging.
http/        The permission matrix as executable attacks, one .http file per role.
```

Try the interface without an account at `/demo`, a local simulation of the chronicle from the design mockups. It is labelled as one, because its dice roll in the browser, which is exactly what the real app never does.

## The permission matrix

Every table has row security on. Rows carry their own read lists; almost no role has write permission on anything.

| Table | Read | Write |
| :-- | :-- | :-- |
| chronicles | chronicle team | Functions only |
| characters | owner + `storyteller` role | **Functions only**, for every role |
| profiles | owner + `storyteller` role | owner (cosmetic fields live only here) |
| character portraits | owner + `storyteller` role (file permissions; the bucket grants upload only) | owner uploads (JPEG, PNG, GIF or WebP up to 5 MB) readable by themselves alone; the `character` Function's `setPortrait` checks the file is theirs and adds the Storyteller. Owner or Storyteller deletes |
| rolls | team, or `storyteller` role only when rolled behind the screen | **nobody**; append-only, created by Functions |
| rollSecrets | `storyteller` role; the team too once revealed | Functions only |
| sealedDifficulties | `storyteller` role | Functions only |
| secrets | `storyteller` role + each user in `visibleTo` | Functions only |
| seals | `storyteller` role + the subject's owner | Functions only |
| scenes | team | Functions only |
| presence | team | own row only (table-level `create` for users) |
| proposals | owner + `storyteller` role | Functions only |
| library | team | Functions only (the Storyteller, through `chronicle.saveEntry`) |
| npcs | `storyteller` role | Functions only (the Storyteller, through `chronicle.saveNpc`) |
| ledger | `storyteller` role | Functions only |

Clients write only their own presence heartbeat, their own character's cosmetic profile and that profile's portrait file. Everything else, the Storyteller's actions included, goes through a Function. That leaves one mechanical write path to audit, and every change to a sheet lands in the ledger.

### Row-level permissions can't express field-level rules, so the data is restructured

Appwrite permissions are per row. V20 wants a player to see their own dice while the difficulty they were rolled against stays behind the screen. That is a per-field disclosure rule, and one row can't carry it. So the difficulty lives in its own row, `rollSecrets`, with its own permissions. A player's websocket is never delivered the number. It isn't delivered and then filtered; it is never sent.

The build spec applies that fix to difficulties. The same constraint breaks one of its other rules. It asks for owners to write "cosmetic fields only" on their character. But an owner who can update the character row can update `bloodPool` on it too. So the sheet is split the same way: `characters` holds everything mechanical and nobody writes it; `profiles` holds name, concept, Nature and Demeanor, and its owner does. Filtering fields in application code would have been the tempting shortcut, and it is exactly what the row model can't enforce.

The same move appears twice more:

- **`sealedDifficulties`.** The Storyteller sets the difficulty for a character's next roll without the player seeing it. The player's character row carries only `difficultySealed: true`, so the UI shows a closed envelope where the number would be: sealed, not absent.
- **`seals`.** When a secret concerns a character, their player gets a seal row: that a secret exists, and how many others hold it. The text is on a row they can't read.

### A player changes their own sheet by proposing, not writing

Players still can't write their mechanical traits: a player who could would raise Firearms just before a roll. So a player's edits go to `proposals`, one row per character, which only the owner and the Storyteller can read. The sheet editor saves the draft a moment after each edit, so the Storyteller watches it take shape on the screen, one line per change: `Firearms 2 → 3`, `+ Eat Food, 1 pt merit`. Approving applies it through the ledger and deletes the proposal in the same transaction; declining leaves it with a note for the player to revise.

Only traits are proposable (clan through Willpower, merits and flaws included). A proposal that touches blood, spent Willpower, health or experience gets a 403. Every edit bumps the proposal's `revision`, and approving names the revision on the Storyteller's screen, so a draft changed in the moment before the click is refused with a 409 rather than applied unseen. The Storyteller edits sheets directly with the same editor, through `character.adjust`.

### New characters are held to the creation budget

Creation follows V20's budget: Attributes 7/5/3, Abilities 13/9/5 with nothing above 3 before freebies, 3 Discipline dots, 5 Background dots (Generation below 13th counts, listed or not, and at most five dots of it), 7 Virtue dots, and 15 freebie points at the book's prices (Attribute 5, Ability 2, Discipline 7, Background, Humanity/Path and Willpower 1, Virtue 2), with up to 7 points of flaws refunded and at most 7 points of merits. Humanity or a Path starts at its two Virtues and Willpower at Courage. Dhampirs use Accursed Heirs' numbers instead (6/4/3, 11/7/4, 2 Discipline dots at 10 apiece, 18 freebies, no Generation). Priorities are never declared: the engine (`creationCost`) takes whichever assignment costs the fewest freebies.

The creation form shows the budget live beside the sheet. The server runs the same calculation in `character.create`: a player's character over budget, or breaking a creation rule, is refused with 409 `needs-approval`. The form then offers to send it to the Storyteller instead (`character.requestCreation`, stored in `creationRequests`, readable only by its player and the Storyteller, at most three open per player). The Storyteller sees each request with the budget in words and the traits that cost the most, and approves it (`approveCreation` creates the sheet exactly as sent, owned by the player, and deletes the request in the same transaction) or declines it with a note the player sees (`declineCreation`). The player can withdraw a request. The Storyteller's own DMPCs aren't held to the budget.

Each campaign can change the numbers. The Storyteller's "Creation budget" panel on the screen edits priorities, free dots, freebies, the Ability cap, the Generation limit, the flaw refund and merit caps, and every freebie price, separately for vampires and dhampirs. It's saved on the chronicle as `creationRules`, holding only what differs from the book (`chronicle.update`, checked by `cleanCreationOverrides`; "Reset all to V20" saves `{}`). The form and the server both read it, so players are held to the campaign's budget, not the book's.

### Export as PDF

A character's owner and the Storyteller can export the sheet as a filled-in V20 character sheet ("Export PDF" on the sheet, and in the Storyteller's controls). The blank sheet is a file in the `sheet-templates` bucket (`v20-sheet`), readable by signed-in users and written only from the console. `SHEET_TEMPLATE=bucketId/fileId npm run provision` creates the bucket and copies an uploaded sheet into it. The sheet has no form fields, so `web/src/lib/sheet-pdf.ts` draws onto it at the template's own coordinates with pdf-lib, in the browser:

- **Page one:** identity, every dot, specialties written small beside their trait, Disciplines and Backgrounds, Virtues (marked Conviction or Instinct when a Path uses them), sect and title, Humanity or Path, Willpower, the blood pool (unavailable boxes struck through), health marks (`*` aggravated, `X` lethal, `/` bashing) and experience.
- **Page two:** merits, flaws, rituals, and any Disciplines or Backgrounds past six as Other Traits. The combat table and armor are read from the library's weapon and armor write-ups.
- **Page three:** carried gear.

The standard PDF fonts can't draw every character, so names are printed as close as they can get ("Aydın" becomes "Aydin"). pdf-lib is loaded only when someone exports.

### Players can keep several characters, and delete them

A player may bring as many characters as they like to a table and switch between them on their screen. `character.delete` removes one for good: its player or the Storyteller can call it, and it must name the character, so a stray call deletes nothing. In one transaction it removes the sheet, profile, open proposal, sealed difficulty and the seals on secrets about it, and takes it out of scenes and initiative. Its rolls and ledger stay as history, and the transaction writes a last ledger line saying who deleted it. That line takes the next version, so a write racing the delete collides with it and the delete is refused with a 409 rather than half-applied.

### Thin-blooded vampires

Generation runs from 4th to 15th. The 14th and 15th are the thin-blooded, following V20's Fourteenth and Fifteenth Generation Flaws. Both hold 10 blood and draw 1 a turn, and the engine's `bloodRules` holds what changes:

- **The reserve:** the bottom of the pool only keeps a thin-blood rising. That's 2 points at 14th and 4 at 15th, and they can't pay for Disciplines, healing or raising Attributes.
- **The cost:** at 15th Generation, and for anyone with the Thin Blood Flaw, each point of effect costs two blood. The per-turn cap counts points of effect, so a 15th-Generation vampire can still act once a turn.

`spendBlood` and `feedAndHeal` apply both, and so do the table's local prediction and the demo. The sheet shows the reserve as dashed vials and says how much is left to spend.

Disciplines are capped at 4 dots for 14th and 3 for 15th; `validateSheet` enforces this on creation, proposals and the Storyteller's adjustments. At creation, choosing a thin-blooded Generation takes its Flaw (2 or 4 points, within the seven-point flaw refund) unless it's already listed. It rules out the Generation Background and starting Status. The sheet's lineage line reads "Thin-blooded", with the rules in a line beneath.

Time of Thin Blood adds the rest:

- **Their own creation budget.** Thin-bloods use `thinBlooded` in `CREATION_RULES`: 6/5/3, 12/8/5, 2 Discipline dots at 10 freebies, and 18 freebies. A campaign's Storyteller can change it on its own tab of the budget editor. `budgetKind` picks it from the template and Generation.
- **Caitiff and Insight.** Every 15th-Generation vampire is Caitiff, and only the thin-blooded can take the Insight Background. Breaking either goes to the Storyteller like any other creation rule.
- **Reawakening the body.** A thin-blood can spend a Willpower point and 5 blood, not doubled but never from the reserve, to bring back a mortal function for the night. That's `spendBlood` with `reawaken: true`, from the blood panel.
- **The library.** Insight, Time of Thin Blood's new Flaws and Merits, and write-ups of the thin-blood creation rules, body, personal Disciplines and character types are in the Chicago Dreams library and the Starter Library.

### Dhampirs

A character's `template` is `vampire` (the default, and what rows from before templates read as) or `dhampir`. Following Accursed Heirs, a dhampir's blood doesn't follow Generation. Their pool is 10 and they spend one point a turn. They start with a full pool rather than rolling for it, since their living body makes the blood. The Storyteller can raise the pool for Antiquity through `character.adjust` (`bloodPoolMax`), and changing the template resets the pool to the new template's rule. `dhampirConcept` (Aspirant, Renegade and the rest) is on the sheet, and players can propose it. They can't propose the template or the pool.

The creation form and the Storyteller's sheet editor offer the template. For a dhampir they hide Generation, label the clan as the Antecedent's, and suggest concepts from the library. Bloodrights are library Disciplines with powers at levels 1–3, so a dhampir lists them with their Disciplines and the Disciplines panel shows what each level does. NPCs can be dhampirs too.

### Rituals and rites

Library entries of kind `ritual` are written `Thaumaturgy ritual 3: …`, `Koldunic Sorcery rite 2: …` or `Sabbat auctoritas rite: …`. The Disciplines panel lists, for each ritual tradition the character can cast, the rituals at or below their rating, collapsed by default: Thaumaturgy, Necromancy, Abyss Mysticism (by Obtenebration), Assamite Sorcery, Koldunic Sorcery and Dririmancy. Gargoyle rituals and Sabbat rites aren't tied to a Discipline, so they appear only in the library. A character's learned rituals are a list on the sheet (`characters.rituals`, `[{ name, level }]`, with level 0 for unlevelled rites). Players propose additions like any other trait and the Storyteller approves them. The panel marks which rituals within reach are already known.

### Sect titles

A character can hold an office in their sect: Prince, Sheriff or Harpy in the Camarilla, Bishop, Ductus or Templar in the Sabbat. `characters.title` holds it, and only the Storyteller's `character.adjust` sets it. A player can't propose a title, and creation ignores one, because offices are awarded, never chosen. The title shows under the lineage line on the sheet and on the coterie card. NPCs have `sect` and `title` too, so the Sheriff can be filed as one. Library entries of kind `sect` (Camarilla, Sabbat, Anarch Movement, Independent, Inconnu and the rest) feed the sect suggestions on the creation form, the sheet editor and the NPC panel; with none in the library, those fields suggest the usual four. Hovering the lineage line on the sheet shows the character's sect. Library entries of kind `title` are written `Camarilla title: …`, `Sabbat title: …` or `Anarch title: …`, and the editors suggest them.

### NPCs behind the screen

The screen has an NPC roster. Each NPC has a stat block (kind, clan, Generation, Attributes, Abilities, Disciplines), a health track, blood, Willpower and notes. The `npcs` rows are readable only by the `storyteller` role and are written only through `chronicle.saveNpc` and `chronicle.removeNpc`. Players never receive them, not even as names.

`rollPool` takes an `npcId` from the Storyteller. It builds the pool from the NPC's traits, applies its wound penalty and, if asked, spends its Willpower, all on the server. The roll goes in the feed under the NPC's name, hidden from the table unless the Storyteller chooses `visibility: "table"`. NPCs ticked "in the fight" join `scene.rollInitiative` through `npcIds` and roll Dexterity + Wits + a die like the coterie. The Disciplines an NPC knows show the library's powers up to its rating.

### Disciplines level by level, combinations, and gear

The player screen's right column shows two more panels, built from the library.

- **Disciplines** lists, for each Discipline on the sheet, the library's powers up to the character's rating. A power's write-up starts with what it needs, then a colon: `Auspex 2: …`, or `Thaumaturgy (Path of Blood) 3: …` for a path. If the sheet names a path-based Discipline without its path, the panel lists the paths the library knows. Below that, **Combinations open to you** lists every combination power, written `Auspex 2 + Presence 3: …` (with `or` for alternatives), whose requirements the character meets.
- **Gear** is a list on the profile (`profiles.equipment`, JSON), which the owner writes directly, as with the rest of the profile. Picking a name from the library's weapons and armor shows its numbers next to it.

### The Storyteller can play a DMPC

"Create a DMPC" on the screen opens the same creation form, and the character is created with the Storyteller as its owner. It goes through the same validation and blood roll as anyone else's and has the same permissions: the Storyteller reads it, players don't, and nobody writes it except through Functions. The screen marks it DMPC. The Storyteller plays it from "My sheet", where the roll panel builds pools from its traits as it does for a player. There's no proposal step, because the Storyteller edits the sheet directly from the screen.

### Six skins

Everyone picks their own look from **Theme** in the top bar or the page footer:

| Skin | Look |
|---|---|
| Camarilla | Candlelight and gold leaf. This is the default. |
| Classical | Marble, terracotta and Tyrian purple, with inscribed caps and diamond pips. |
| Dark Ages | Parchment leaves on a cold green crypt, red wax, and round dice. |
| Toreador | A fashion quarterly: Didone names, spaced sans-serif caps, one crimson. |
| Jazz Age | Black lacquer, gold deco, a green-felt roll table, diamond pips and a poker-chip seal. |
| Sabbat | Bone and blackletter, typewritten labels, square pips, slashed vitae and a torn red edge. |

Each skin is a set of CSS tokens under `[data-theme]` in `app.css`: colours, fonts, pip, die and vial shapes, and the solid button. A skin also has a small lexicon in `lib/theme.svelte.ts`. For example, the roll is "Tonight's performance" and "Perform" in Toreador, and "The rite" and "Strike" in Sabbat. When a degeneration check fails, each skin shows its own moment: the seal breaks, the marble cracks, the ink runs, a correction is printed, the gold tarnishes, the mark is scored.

The choice is stored in the browser only, in `localStorage`, and never reaches the server. A small script in `app.html` applies it before first paint, so the page doesn't flash the default. Each skin's fonts load only when someone picks it.

### The dawn warning

In the half hour before the player's local sunrise, warm light creeps in from the edges of the page and a strip under the masthead counts down: *The sky is lightening. Find your haven. Dawn in 12 minutes.* It disappears when the sun is up, and it can be dismissed for the morning.

Sunrise is calculated in the browser (`lib/dawn.ts`) with the NOAA approximation, which is good to a minute or two except near the poles. During polar night the warning simply never fires. Location is guessed from the browser's time zone, using that zone's main city, or from the UTC offset if the zone isn't in the list. **Not your sky? Use my location** asks for the device's location once. It's rounded to a neighbourhood and kept in `localStorage`; it is never sent anywhere.

### Dice eggs

A few rolls hatch something in the feed (`lib/dice-eggs.ts`):

- **Three or more dice, every one a 10:** the dice glow gold and the feed says *The Beast purrs.*
- **A botch where every die is a 1, with two dice or more:** the lights flicker once.
- **Exactly thirteen successes:** a whisper appears and fades.

The flicker and the glow animation play only when a roll arrives live, never on reload. The flicker is skipped when someone prefers reduced motion. The eggs are decoration on rolls the server already made; they never change a result.

### A private notepad

Every seat at the table has a notepad: on the player's screen next to the feed, and behind the Storyteller's screen. Use it for names, debts, and who lied to whom. It saves itself a moment after you stop typing, and again when you leave the page. Notes carry no stakes, so the client writes them directly, like presence. Each person has one row per chronicle, and its permissions name only its author. Other players can't read it, and neither can the Storyteller. A player's notes are just as private from the Storyteller as the Storyteller's are from the players.

The notepad's **Coterie** tab is one shared page per chronicle that everyone at the table can read and edit, the Storyteller included. Edits arrive live. Before a save, the client checks that nobody else saved since its copy was loaded. If someone did, or their edit arrives while you're typing, nothing is overwritten silently: you see their version and choose "Keep mine" or "Take theirs". Only the `chronicle` Function's `openNotes` action can create the row. There's no table-level create, so nobody outside the team can claim the id first. The row's permissions are read and update for the chronicle's team.

### The red card

Every screen at the table carries a red card in the corner. Anyone seated, players and Storyteller alike, can raise it with one tap. A banner then goes up for the whole table: the current thread stops, and nobody has to explain why. The Storyteller rewinds, skips past it or takes the scene somewhere else, then clears the card. Only the Storyteller can clear it.

The card is anonymous by design. The `chronicle` Function's `redCard` action stores only *when* a card went up (`chronicles.redCardAt`), never who raised it. A second raise while one is already up changes nothing, so the timestamp can't give away who pressed it later. The raiser's own screen remembers that it was theirs, and nothing else does. No client can write the chronicle row directly, and someone not at the table gets a 403.

### The reference library is the Storyteller's words, not the book's

Each chronicle has a library of clans and bloodlines, merits, flaws, Disciplines and their individual powers, Paths of Enlightenment, Backgrounds and house rules, written up by the Storyteller and readable by the whole table. An entry is a name, a cost for merits and flaws, a summary, and an optional page reference like `V20 p. 481` for anyone who owns the book. When a player picks a clan or a Path, or adds a merit or flaw while proposing changes or at character creation, the editor offers the library's names, fills in the cost, and shows the summary under the field. The sheet shows it as a tooltip. Attributes and Abilities can have a write-up too: a summary line, then a line per dot starting with that many bullets (`••• Good: …`). The sheet shows the whole ladder on hover with the character's rating marked, a tap opens the current dot's line, and the editors show it under each trait as it changes.

It holds no rulebook text by design (see *Content and licensing* below): a page number points into a book the reader owns without copying it. Names are unique within a kind, since that's how a sheet finds its entry. Players can still type something the library doesn't list; the Storyteller decides whether to approve it.

A new chronicle starts with a copy of a starter chronicle's library, so its Storyteller isn't facing an empty reference. The starter is an ordinary chronicle, named by the chronicle Function's `STARTER_CHRONICLE_ID` variable (`STARTER_CHRONICLE_ID=… npm run provision` sets it; it applies on the Function's next deployment). The copy is made once, at creation, as entries the new chronicle owns: its Storyteller can edit or remove them, and later changes to the starter don't reach chronicles that already exist. Without the variable a chronicle starts empty, and a failed copy never fails the creation.

## Dice

`rollPool` takes trait names, never numbers. A player sends `{"traits": ["dexterity", "firearms"]}`. The Function reads the sheet from the database, sums the dots, reads marked health for the wound penalty, reads temporary Willpower, checks any claimed specialty against the 4-dot rule, and rolls every die with `crypto.getRandomValues`, using rejection sampling so a d10 from a byte carries no modulo bias.

A player who sends `basePool`, `difficulty`, `modifier`, `label` or `visibility` gets a **403**, not a silently ignored field, so the attack specs can assert on it. Those are the Storyteller's inputs.

The V20 arithmetic lives in `engine/src/dice.ts`, once:

- **Ones subtract.** Each 1 cancels a success, including a 1 on a specialty reroll.
- **Specialties reroll 10s**, cumulatively, capped at 20 deep so a pathological roll can't hang the Function.
- **Willpower** buys one automatic success after resolution, **once per turn**. It can't rescue a botch.
- **The botch rule is the chronicle's choice.** Tables disagree about whether ones cancelling successes to exactly zero is a botch. The Storyteller picks at setup; the engine never assumes.

`virtueCheck` (degeneration, frenzy, rötschreck) routes through the same pipeline.

Degeneration is never one click. It takes three deliberate steps:

1. The Storyteller names the sin in their own words and picks a difficulty. The app ships no Hierarchy of Sins text, only what the Storyteller writes. The sin goes into `reckonings`, which the character's player and the Storyteller can read. The difficulty goes into `reckoningSeals`, which only the Storyteller can read.
2. The player sees a dark card with the sin and what's at stake, and presses and holds "Face it" until a bar fills. Letting go early cancels it. Space or Enter works too. Only the character's own player can face it, never the Storyteller on their behalf. A sin can be faced once: a second press finds nothing to roll, because the check runs inside the compare-and-swap.
3. The server rolls it. A failure drops the Path rating in the same committed version as the roll, and the sin, the difficulty and the change are logged to the feed. The table gets a banner either way: a red one for a fall, a quieter one when the character holds. On the player's own screen, the lost dot glows, cracks and falls away.

The Storyteller can withdraw a laid sin before it's faced.

## Concurrency: a real compare-and-swap

Appwrite has no conditional update. It does have primary keys and transactions, and together they make a real CAS.

Every character mutation writes a **ledger** row whose id is `${characterId}.v${version + 1}`, in the same transaction as the character update. Two writers that both read version 5 both try to create `….v6`. The database accepts exactly one; the other's commit fails with 409, nothing it staged is applied, and it re-reads version 6 and recomputes. Callers send deltas (`applyDamage(+2)`), which compose, and never absolutes (`setHealth(2)`), which don't. So a player marking two boxes and the Storyteller marking three from the same attack is five boxes, in either order. `functions/test/state.test.ts` stages exactly that race.

The ledger is also an append-only history of every change to every sheet, readable behind the screen, which gets the backlog's session-log export most of the way for free.

## Realtime, optimistic updates, reconnect

`web/src/lib/table.svelte.ts` holds one chronicle live.

- **Subscriptions** cover every table's `tablesdb.coterie.tables.*.rows` channel. Appwrite applies read permissions to the socket, so a roll behind the screen produces no event on a player's socket: there is no event to filter, not a filtered one. A reveal arrives as an update event at the moment the row becomes readable.
- **Optimistic updates.** Marking a health box or spending blood renders at once as a pending delta, folded over server state with the same engine functions the server uses. The delta drops once a row at or past the version the Function reported arrives. If the Function refuses, it drops at once and the field flashes to show the server corrected it.
- **Reconnect.** When the socket reopens after a drop, the snapshot is refetched and replaced wholesale. Then every roll made since the last event is replayed into the feed, marked *While you were away*. A player who wakes their laptop three scenes later gets the story of what they missed, not a silent jump in the numbers.

## Turns and the per-turn caps

The blood cap per turn is set by generation (13th draws 1 a turn; 4th draws 10), and it's the rule tables forget most often. The counter on each sheet is stamped with a turn reference and reads as zero once the turn moves on. Nothing has to sweep the sheets, and there is no window where two clients disagree about the turn.

Turn references are chronicle-wide: `chronicle.turnSerial` only increases, and a scene's turn *N* is `turnBase + N`. So blood spent in the third turn of one scene can't be mistaken for the third turn of the next. Outside a scene there is no turn, and the cap limits each spend on its own.

## Running it

### 1. Appwrite projects

Two projects on Appwrite Cloud, `coterie-staging` and `coterie-production`, for this one app. Those are their names; Appwrite gives each a generated ID, and commands take the ID. Staging is `6ab741a5001eb649271f`, in the nyc region. Create an API key in each with the tables, columns, indexes, buckets, functions, users and teams scopes, then:

```sh
npm install
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1 \
APPWRITE_PROJECT_ID=6ab741a5001eb649271f \
APPWRITE_API_KEY=… \
npm run provision
```

`provision.ts` reads `functions/src/shared/schema.ts`, the single declaration of every table, column and index. It creates what's missing, including the private character-portrait bucket, and never deletes. Functions are created with runtime `node-22`, `execute: ["users"]` (each Function authorizes its caller itself), the scopes they need, and the build command `npm ci --workspace functions --include-workspace-root && npm run build --workspace functions`, with entrypoint `functions/dist/<name>.js`.

Then connect the Functions to Git. Installing Appwrite's GitHub app on this repository is a console step, once per project: open any Function, **Settings → Git → Connect Git**. After that, every Function is connected with root directory `.` and production branch `main`, in the console or through the API; `provision.ts` doesn't do it, because an update that omits the provider fields can disconnect a Function. From then on, a push to `main` deploys the backend. Staging is connected.

Enable **Magic URL** under Auth. A site served from `*.appwrite.network` worked on staging without a Web platform; a custom domain needs its origin added as one.

### 2. The web app

```sh
cp web/.env.example web/.env      # PUBLIC_APPWRITE_ENDPOINT, PUBLIC_APPWRITE_PROJECT_ID
npm run dev
```

It is a static single-page app (`adapter-static`, `index.html` fallback). On Appwrite Sites it builds from the repository root, because `web` imports from `engine/` and `functions/`: root directory `.`, build runtime `node-22`, install `npm ci`, build `npm run build -w web`, output `web/build`, fallback `index.html`, production branch `main`. Set `PUBLIC_APPWRITE_ENDPOINT` and `PUBLIC_APPWRITE_PROJECT_ID` as site variables; they're baked in at build time. Staging's site is `coterie-web`, at `https://coterie-staging.appwrite.network`, and a push to `main` redeploys it.

### 3. Appwrite MCP for Claude Code

`.mcp.json` registers Appwrite's hosted MCP server for this repository. In Claude Code, run `/mcp`, select **appwrite**, then **Authenticate**. After that, Claude Code can inspect and manage the projects directly.

## Tests

```sh
npm test          # engine (76) + Functions (63), node:test, no network
npm run typecheck # engine, functions, scripts, web (svelte-check, warnings fail)
```

The Function tests run the real handlers against an in-memory TablesDB (`functions/test/fake.ts`) that honours the contract the design depends on: 404 on a missing row, 409 on a duplicate id, and all-or-nothing commits. A `beforeCommit` hook runs a competing write inside a transaction's window.

### Test it like an attacker

`http/` holds one file per role: `player.http`, `storyteller.http`, `stranger.http`, `anonymous.http`. Each request is something that role could send from devtools, and each assertion is the refusal that proves the model holds: a player POSTing to `rolls` (401), PATCHing their own blood pool (401), reading another sheet (404), sending a difficulty to `rollPool` (403), advancing the turn to reset their own blood cap (403). The Storyteller can't edit a roll after the fact either.

```sh
APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1 APPWRITE_PROJECT_ID=6ab741a5001eb649271f APPWRITE_API_KEY=… npm run fixture
```

seeds a known table through the Functions' own handlers and writes 15-minute JWTs to `http/http-client.private.env.json` (gitignored). Then run the files in the WebStorm HTTP client against the `staging` environment. CI does the same on pushes to `main` once the repository has `APPWRITE_ENDPOINT` and `APPWRITE_PROJECT_ID` variables (repository-level, so the job's `if` can see them) and a `staging` environment holding an `APPWRITE_API_KEY` secret.

## Deliberate choices, written down

- **Feeding is the Storyteller's.** Blood entering the pool comes from the story. Players may heal (1 blood a box, inside the per-turn cap); aggravated healing is downtime and Storyteller-only.
- **Rerolled 1s cancel.** Tables differ; this is the reading the engine takes, and it lives in one function.
- **The invite code sits on the team-readable chronicle row.** Anyone at the table could invite a friend anyway; `rotateInvite` answers a leak.
- **A revealed secret tells prior holders who else now knows.** Appwrite sends the update to everyone who can read the row, and `visibleTo` is on it. That's arguably the fiction working; it's a choice, not an oversight.
- **Player-created sheets are range-checked, not balanced.** Dots are validated (1–5, specialties at 4+, generation 4–13), and merits and flaws are 1–7 points each; character-creation point budgets aren't, including V20's 7-point cap on flaws, which the form flags but the server leaves to the Storyteller. The Storyteller adjusts via `character.adjust`, or approves a player's proposal, and both go through the ledger like everything else.

## Not in v1

Maps, tokens, grid combat, voice, chat, roll macros, a creation wizard, XP spend tracking, mobile-native apps. From the backlog: combat resolution and soak, Discipline activation with blood costs, the V20 XP cost table, blood bonds, derangements, and the session-log export (the ledger and the append-only roll log already hold the data).

## Content and licensing

Vampire: The Masquerade is owned by Paradox Interactive; V20 is published under licence by Onyx Path. Coterie is a free, non-commercial fan tool. It ships the engine, not the book: dice arithmetic, trackers, the permission model, and bare game statistics (the generation and health tables, trait names). It carries no clan write-ups, Discipline text, Hierarchy of Sins or rulebook prose; players type their own. Before making anything public, read the current Dark Pack terms and check the disclaimer in the app footer against them. The wording here was not verified against the live terms.
