/**
 * Читання документів для імпорту картин — у браузері, до відправки на сервер.
 *
 * Офісні формати (DOCX, PPTX, XLSX, ODT, ODS, ODP) — це zip-архіви з XML. Ми
 * витягуємо з них текст, а на місці кожного зображення ставимо маркер [[IMAGE n]],
 * щоб модель могла сказати, яке фото належить якій картині. Самі зображення
 * лишаються в браузері й пізніше завантажуються звичайним шляхом — по одному,
 * стиснуті. Так на сервер іде лише текст, і великий каталог із фото не впирається
 * в ліміт розміру запиту на хостингу.
 *
 * PDF модель читає сама, тож його надсилаємо файлом.
 */
import { strFromU8, unzipSync } from 'fflate';
// Окремий підшлях: головний вхід core тягне серверні модулі (node:crypto).
import { MAX_IMPORT_TEXT_CHARS, imageMarker } from '@canvascast/core/import';

export interface DocumentImage {
  /** Ім'я файлу в архіві — для повідомлень про помилки. */
  name: string;
  blob: Blob;
}

export type ParsedDocument =
  | { kind: 'text'; text: string; images: DocumentImage[]; truncated: boolean }
  /** Скан без текстового шару: модель читає PDF сама, зображення пронумеровано за порядком. */
  | { kind: 'file'; blob: Blob; mimeType: string; images: DocumentImage[] };

/** Розширення, які приймає імпорт (для атрибута accept). */
export const IMPORT_ACCEPT =
  '.pdf,.docx,.odt,.pptx,.odp,.xlsx,.ods,.csv,.tsv,.txt,.md,.html,.htm,.json,' +
  'application/pdf,text/plain,text/csv,text/markdown,text/html';

/** Тіло запиту на безкоштовному хостингу обмежене 4,5 МБ, а скан PDF іде як є. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 60;
/** Дрібні зображення — значки, лінії, логотипи — фото картин не бувають. */
const MIN_IMAGE_BYTES = 8 * 1024;

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export class DocumentError extends Error {}

export async function readDocument(file: File): Promise<ParsedDocument> {
  const ext = extensionOf(file.name);
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return readPdf(new Uint8Array(await file.arrayBuffer()), file);
  }
  if (ext === 'doc' || ext === 'xls' || ext === 'ppt' || ext === 'rtf') {
    throw new DocumentError(`Формат .${ext} не підтримується. Збережіть документ як DOCX, XLSX або PDF.`);
  }
  if (ext && ZIP_FORMATS.has(ext)) {
    return parseOfficeDocument(new Uint8Array(await file.arrayBuffer()), ext);
  }
  if ((ext && TEXT_FORMATS.has(ext)) || file.type.startsWith('text/')) {
    const raw = await file.text();
    return finish(ext === 'html' || ext === 'htm' ? htmlToText(raw) : raw, []);
  }
  throw new DocumentError(
    'Цей формат не підтримується. Підійдуть PDF, DOCX, ODT, PPTX, XLSX, ODS, CSV, TXT або Markdown.',
  );
}

/** Менше літер — вважаємо PDF сканом без текстового шару. */
const MIN_PDF_LETTERS = 40;

/**
 * PDF з текстом розбираємо самі (текст + фото, як DOCX) — тоді розмір файлу не
 * важливий. Скан без тексту модель мусить прочитати сама, тож він іде файлом.
 */
export async function readPdf(bytes: Uint8Array, original: Blob): Promise<ParsedDocument> {
  let parsed;
  try {
    const { parsePdf } = await import('./pdf');
    parsed = await parsePdf(bytes, { maxImages: MAX_IMAGES });
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'PasswordException') {
      throw new DocumentError('PDF захищено паролем. Зніміть захист і спробуйте знову.');
    }
    throw new DocumentError('Не вдалося прочитати PDF: файл пошкоджений або має незвичний формат.');
  }
  if (parsed.letters >= MIN_PDF_LETTERS) return finish(parsed.text, parsed.images);
  if (original.size <= MAX_PDF_BYTES) {
    return { kind: 'file', blob: original, mimeType: 'application/pdf', images: parsed.images };
  }
  // Великий скан не розбиваємо на «фото»: сторінки-скани — не фото творів.
  throw new DocumentError(
    'Схоже, це скан без текстового шару, і він більший за 4 МБ. Стисніть PDF або розпізнайте текст (OCR) і спробуйте знову.',
  );
}

const ZIP_FORMATS = new Set(['docx', 'pptx', 'xlsx', 'odt', 'ods', 'odp']);
const TEXT_FORMATS = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'html', 'htm']);

function extensionOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

/** Розбір офісного документа з байтів (окремо від File — для тестів). */
export function parseOfficeDocument(bytes: Uint8Array, ext: string): ParsedDocument {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new DocumentError('Не вдалося відкрити документ: файл пошкоджений або це не той формат.');
  }
  const images = new ImageCollector(files);
  let text: string;
  if (ext === 'docx') text = parseDocx(files, images);
  else if (ext === 'pptx') text = parsePptx(files, images);
  else if (ext === 'xlsx') text = parseXlsx(files);
  else text = parseOdf(files, images);
  return finish(text, images.list);
}

function finish(rawText: string, images: DocumentImage[]): ParsedDocument {
  const text = rawText
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text && images.length === 0) {
    throw new DocumentError('У документі не знайдено тексту.');
  }
  const truncated = text.length > MAX_IMPORT_TEXT_CHARS;
  return { kind: 'text', text: truncated ? text.slice(0, MAX_IMPORT_TEXT_CHARS) : text, images, truncated };
}

/* ───────────── Зображення ───────────── */

/** Нумерує зображення в порядку появи; одне й те саме фото отримує один номер. */
class ImageCollector {
  readonly list: DocumentImage[] = [];
  private readonly seen = new Map<string, number>();

  constructor(private readonly files: Record<string, Uint8Array>) {}

  /** Повертає маркер для тексту або '' (зображення не підходить чи не знайдене). */
  marker(path: string): string {
    const known = this.seen.get(path);
    if (known !== undefined) return known ? ` ${imageMarker(known)} ` : '';
    const data = this.files[path];
    const type = IMAGE_TYPES[extensionOf(path)];
    if (!data || !type || data.length < MIN_IMAGE_BYTES || this.list.length >= MAX_IMAGES) {
      this.seen.set(path, 0);
      return '';
    }
    // Копія: Blob не повинен тримати весь розпакований архів.
    this.list.push({ name: path.split('/').pop() ?? path, blob: new Blob([data.slice()], { type }) });
    this.seen.set(path, this.list.length);
    return `\n${imageMarker(this.list.length)}\n`;
  }
}

/** Зв'язки part → файл у OOXML (`_rels/*.rels`). */
function readRels(files: Record<string, Uint8Array>, partPath: string): Map<string, string> {
  const dir = partPath.slice(0, partPath.lastIndexOf('/') + 1);
  const relsPath = `${dir}_rels/${partPath.slice(dir.length)}.rels`;
  const map = new Map<string, string>();
  const xml = files[relsPath];
  if (!xml) return map;
  for (const tag of strFromU8(xml).match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attr(tag, 'Id');
    const target = attr(tag, 'Target');
    if (id && target && attr(tag, 'TargetMode') !== 'External') map.set(id, resolvePath(dir, target));
  }
  return map;
}

function resolvePath(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (dir + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

/* ───────────── XML ───────────── */

interface XmlToken {
  /** Ім'я тегу з префіксом простору імен (w:p) або null для тексту. */
  tag: string | null;
  close: boolean;
  selfClose: boolean;
  raw: string;
}

/** Мінімальний потоковий токенізатор: офісному XML цього досить, а DOMParser немає в тестах. */
function* tokens(xml: string): Generator<XmlToken> {
  const re = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>|<[!?][^>]*>|([^<]+)/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[5] !== undefined) yield { tag: null, close: false, selfClose: false, raw: m[5] };
    else if (m[2]) yield { tag: m[2], close: m[1] === '/', selfClose: m[4] === '/', raw: m[0] };
  }
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name.replace(/[.:]/g, '\\$&')}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m ? decodeEntities(m[1]!) : undefined;
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x') ? Number.parseInt(k.slice(2), 16) : Number.parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });
}

/* ───────────── Формати ───────────── */

/**
 * Таблиця → рядки «клітинка | клітинка». Абзаци всередині клітинки йдуть через пробіл,
 * щоб рядок таблиці не розсипався на кілька рядків тексту.
 */
class TextOut {
  text = '';
  cell = 0;
  add(s: string) {
    this.text += s;
  }
  paragraphEnd() {
    this.text += this.cell > 0 ? ' ' : '\n';
  }
  cellStart() {
    this.cell++;
  }
  cellEnd() {
    this.cell = Math.max(0, this.cell - 1);
    this.text = this.text.replace(/[ \t]+$/, '') + ' | ';
  }
  rowEnd() {
    this.text = this.text.replace(/(?:\s*\|)+\s*$/, '') + '\n';
  }
}

function parseDocx(files: Record<string, Uint8Array>, images: ImageCollector): string {
  const part = 'word/document.xml';
  const xml = files[part];
  if (!xml) throw new DocumentError('Не вдалося прочитати документ Word.');
  const rels = readRels(files, part);
  const out = new TextOut();
  let inText = false;
  for (const t of tokens(strFromU8(xml))) {
    if (t.tag === null) {
      if (inText) out.add(decodeEntities(t.raw));
      continue;
    }
    switch (t.tag) {
      case 'w:t':
        inText = !t.close && !t.selfClose;
        break;
      case 'w:tab':
        if (!t.close) out.add('\t');
        break;
      case 'w:br':
      case 'w:cr':
        if (!t.close) out.add('\n');
        break;
      case 'w:p':
        if (t.close) out.paragraphEnd();
        break;
      case 'w:tc':
        if (t.close) out.cellEnd();
        else if (!t.selfClose) out.cellStart();
        break;
      case 'w:tr':
        if (t.close) out.rowEnd();
        break;
      case 'a:blip': {
        const target = rels.get(attr(t.raw, 'r:embed') ?? '');
        if (target) out.add(images.marker(target));
        break;
      }
      case 'v:imagedata': {
        const target = rels.get(attr(t.raw, 'r:id') ?? '');
        if (target) out.add(images.marker(target));
        break;
      }
    }
  }
  return out.text;
}

function parsePptx(files: Record<string, Uint8Array>, images: ImageCollector): string {
  const slides = Object.keys(files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (slides.length === 0) throw new DocumentError('У презентації не знайдено слайдів.');
  let out = '';
  for (const part of slides) {
    const rels = readRels(files, part);
    const slide = new TextOut();
    let inText = false;
    for (const t of tokens(strFromU8(files[part]!))) {
      if (t.tag === null) {
        if (inText) slide.add(decodeEntities(t.raw));
      } else if (t.tag === 'a:t') inText = !t.close && !t.selfClose;
      else if (t.tag === 'a:p' && t.close) slide.paragraphEnd();
      else if (t.tag === 'a:br' && !t.close) slide.add('\n');
      else if (t.tag === 'a:tc') {
        if (t.close) slide.cellEnd();
        else if (!t.selfClose) slide.cellStart();
      } else if (t.tag === 'a:tr' && t.close) slide.rowEnd();
      else if (t.tag === 'a:blip') {
        const target = rels.get(attr(t.raw, 'r:embed') ?? '');
        if (target) slide.add(images.marker(target));
      }
    }
    out += `\n\n--- Слайд ${slideNumber(part)} ---\n${slide.text}`;
  }
  return out;
}

const slideNumber = (p: string) => Number(/(\d+)\.xml$/.exec(p)?.[1] ?? 0);

function parseXlsx(files: Record<string, Uint8Array>): string {
  const shared: string[] = [];
  const sst = files['xl/sharedStrings.xml'];
  if (sst) {
    let current: string | null = null;
    let inText = false;
    for (const t of tokens(strFromU8(sst))) {
      if (t.tag === null) {
        if (inText && current !== null) current += decodeEntities(t.raw);
      } else if (t.tag === 'si') {
        if (!t.close) current = '';
        if (t.close || t.selfClose) {
          shared.push(current ?? '');
          current = null;
        }
      } else if (t.tag === 't') inText = !t.close && !t.selfClose;
      else if (t.tag === 'rPh') inText = false; // фонетичні підказки — не текст клітинки
    }
  }

  const sheets = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (sheets.length === 0) throw new DocumentError('У таблиці не знайдено аркушів.');

  let out = '';
  for (const part of sheets) {
    if (sheets.length > 1) out += `\n\n--- Аркуш ${slideNumber(part)} ---\n`;
    let row: string[] = [];
    let col = 0;
    let cellType = '';
    let value = '';
    let capture = false;
    for (const t of tokens(strFromU8(files[part]!))) {
      if (t.tag === null) {
        if (capture) value += decodeEntities(t.raw);
        continue;
      }
      if (t.tag === 'row') {
        if (t.close || t.selfClose) {
          while (row.length && !row[row.length - 1]) row.pop();
          if (row.length) out += row.join(' | ') + '\n';
          row = [];
        } else row = [];
      } else if (t.tag === 'c') {
        if (!t.close) {
          cellType = attr(t.raw, 't') ?? '';
          col = columnIndex(attr(t.raw, 'r')) ?? row.length;
          value = '';
        }
        if (t.close || t.selfClose) {
          const text = cellType === 's' ? (shared[Number(value)] ?? '') : value;
          row[col] = text.replace(/\s+/g, ' ').trim();
          for (let i = 0; i < col; i++) row[i] ??= '';
        }
      } else if (t.tag === 'v' || t.tag === 't') {
        capture = !t.close && !t.selfClose;
      }
    }
  }
  return out;
}

/** "C12" → 2 */
function columnIndex(ref: string | undefined): number | undefined {
  const letters = ref && /^([A-Z]+)/.exec(ref)?.[1];
  if (!letters) return undefined;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseOdf(files: Record<string, Uint8Array>, images: ImageCollector): string {
  const xml = files['content.xml'];
  if (!xml) throw new DocumentError('Не вдалося прочитати документ OpenDocument.');
  const out = new TextOut();
  let inBody = false;
  let skip = 0; // анотації та службові блоки не потрапляють у текст
  let para = 0; // текст має сенс лише всередині абзаців; поза ними — відступи XML
  for (const t of tokens(strFromU8(xml))) {
    if (t.tag === null) {
      if (inBody && !skip && para > 0) out.add(decodeEntities(t.raw));
      continue;
    }
    if ((t.tag === 'text:p' || t.tag === 'text:h') && !t.selfClose) para += t.close ? -1 : 1;
    if (t.tag === 'office:body') inBody = !t.close;
    if (t.tag === 'office:annotation' || t.tag === 'text:tracked-changes') {
      if (!t.selfClose) skip += t.close ? -1 : 1;
      continue;
    }
    if (!inBody || skip) continue;
    switch (t.tag) {
      case 'text:p':
      case 'text:h':
        if (t.close) out.paragraphEnd();
        break;
      case 'text:s':
        out.add(' '.repeat(Number(attr(t.raw, 'text:c') ?? 1) || 1));
        break;
      case 'text:tab':
        out.add('\t');
        break;
      case 'text:line-break':
        out.add('\n');
        break;
      case 'table:table-cell':
      case 'table:covered-table-cell':
        if (!t.close && !t.selfClose) out.cellStart();
        else out.cellEnd();
        break;
      case 'table:table-row':
        if (t.close) out.rowEnd();
        break;
      case 'draw:page':
        if (!t.close) out.add('\n\n--- Слайд ---\n');
        break;
      case 'draw:image': {
        const href = attr(t.raw, 'xlink:href');
        if (href && !t.close && !/^[a-z]+:/i.test(href)) out.add(images.marker(resolvePath('', href)));
        break;
      }
    }
  }
  return out.text;
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|figure|figcaption)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<[^>]+>/g, ''),
  );
}
