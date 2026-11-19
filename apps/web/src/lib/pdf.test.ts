import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePdf, toRgba, type PdfImageObject } from './pdf';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`../../../../test-documents/${name}`, import.meta.url)));
/** Замість canvas: «JPEG» із розміром зображення, щоб перевірити, що саме витягнуто. */
const encode = async (img: PdfImageObject) => new Blob([`${img.width}x${img.height}`], { type: 'image/jpeg' });

describe('PDF', () => {
  it('каталог: текст, фото на своїх місцях, логотип відкинуто', async () => {
    const pdf = await parsePdf(fixture('09-catalog.pdf'), { encode });
    const sizes = await Promise.all(pdf.images.map((i) => i.blob.text()));
    // Фото художниці (600×800) і 4 фото творів (900×680); логотип 64×64 — ні.
    expect(sizes).toEqual(['600x800', '900x680', '900x680', '900x680', '900x680']);
    expect(pdf.letters).toBeGreaterThan(500);

    const t = pdf.text;
    const at = (s: string) => t.indexOf(s);
    // Маркер стоїть перед підписом свого твору й після підпису попереднього.
    expect(at('[[IMAGE 1]]')).toBeGreaterThan(at('Виставка триває') - 40);
    expect(at('[[IMAGE 1]]')).toBeLessThan(at('у майстерні'));
    expect(at('[[IMAGE 2]]')).toBeLessThan(at('Ранок над ставом'));
    expect(at('[[IMAGE 3]]')).toBeGreaterThan(at('Ранок над ставом'));
    expect(at('[[IMAGE 3]]')).toBeLessThan(at('Бабусин сад'));
    expect(at('[[IMAGE 4]]')).toBeLessThan(at('Червоні маки'));
    // У «Нічного потяга» фото немає: між ним і «Білою хатою» — фото «Білої хати».
    expect(at('[[IMAGE 5]]')).toBeGreaterThan(at('Нічний потяг'));
    expect(at('[[IMAGE 5]]')).toBeLessThan(at('Біла хата'));
  });

  it('скан без текстового шару: літер немає, сторінка-зображення витягнута', async () => {
    const pdf = await parsePdf(fixture('27-scanned.pdf'), { encode });
    expect(pdf.letters).toBe(0);
    expect(pdf.images.length).toBeGreaterThan(0);
  });

  it('пікселі pdf.js → RGBA: RGB, ч/б і прозорість на білому', () => {
    expect([...toRgba({ width: 1, height: 1, kind: 2, data: new Uint8Array([10, 20, 30]) })!]).toEqual([10, 20, 30, 255]);
    expect([...toRgba({ width: 2, height: 1, kind: 1, data: new Uint8Array([0b10000000]) })!]).toEqual([
      255, 255, 255, 255, 0, 0, 0, 255,
    ]);
    expect([...toRgba({ width: 1, height: 1, kind: 3, data: new Uint8Array([0, 0, 0, 0]) })!]).toEqual([255, 255, 255, 255]);
    expect(toRgba({ width: 1, height: 1, kind: 9, data: new Uint8Array(4) })).toBeNull();
  });
});
