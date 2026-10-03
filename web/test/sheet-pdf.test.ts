import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';

import { armorStats, fillSheet, printable, weaponStats, type SheetData } from '../src/lib/sheet-pdf.ts';

describe('the PDF character sheet', () => {
  it('reads combat columns out of library summaries', () => {
    assert.deepEqual(weaponStats('Ranged. 4 dice; range 20 yards (double at difficulty 8); rate 4; holds 15+1. Hides in a pocket.'), { damage: '4', range: '20', rate: '4', clip: '15+1', conceal: 'P' });
    assert.deepEqual(weaponStats('Melee. Damage Strength +1 bashing (lethal to the head). Hides in a trenchcoat.'), { damage: 'Str +1 bashing', conceal: 'T' });
    assert.equal(weaponStats('Melee. Damage Strength +3 lethal. Can’t be hidden.').conceal, 'N');
    assert.deepEqual(weaponStats('A lucky coin.'), {});
    assert.deepEqual(armorStats('Armor (Kevlar vest). +3 soak against bashing. −1 dice to Dexterity-based rolls.'), { rating: '3', penalty: '−1', description: 'Kevlar vest' });
  });

  it('turns text the standard fonts can’t draw into text they can', async () => {
    const font = await (await PDFDocument.create()).embedFont('Times-Roman');
    assert.equal(printable(font, 'Ceren Aydın'), 'Ceren Aydin');
    assert.equal(printable(font, 'Café −1 ✝'), 'Café -1 ?');
  });

  it('fills a four-page sheet without throwing, whatever the character holds', async () => {
    const blank = await PDFDocument.create();
    for (let i = 0; i < 4; i++) blank.addPage([639.12, 819.12]);
    const template = await blank.save();
    const d: SheetData = {
      name: 'Łucja Øster', player: 'P', chronicle: 'C', nature: '', demeanor: '', concept: '', clan: 'Lasombra', generation: '8th', sire: '',
      notes: ['Sect: Sabbat'], attributes: { strength: 5 }, abilities: { brawl: 5 }, specialties: [{ trait: 'brawl', text: 'Grappling' }],
      disciplines: Array.from({ length: 9 }, (_, i) => ({ name: `Discipline ${i}`, level: 3 })), backgrounds: [], virtues: { conviction: 4, instinct: 3, courage: 5 },
      path: 'Path of Night', pathRating: 7, willpowerPermanent: 9, willpowerTemporary: 4, bloodPool: 18, bloodPoolMax: 30, bloodPerTurn: 3,
      health: { bashing: 3, lethal: 3, aggravated: 3 }, experienceTotal: 100, experienceSpent: 40, merits: [], flaws: [], rituals: [{ name: 'Sun Dance', level: 0 }],
      weapons: [{ name: 'Axe', detail: 'Melee. Damage Strength +3 lethal. Can’t be hidden.' }], armor: { name: 'Armor, Class Two', detail: 'Armor (armored T-shirt). +2 soak. −1 dice.' }, gear: ['Rope'],
    };
    const out = await fillSheet(template, d);
    assert.ok(out.length > template.length);
    assert.equal((await PDFDocument.load(out)).getPageCount(), 4);
  });
});
