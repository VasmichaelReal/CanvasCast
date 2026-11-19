import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DocumentError, parseOfficeDocument } from './documents';

const IMG = new Uint8Array(10_000).fill(7); // достатньо великий, щоб не вважатися значком
const ICON = new Uint8Array(100);
const zip = (files: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));

function textOf(doc: ReturnType<typeof parseOfficeDocument>) {
  if (doc.kind !== 'text') throw new Error('expected text');
  return doc;
}

describe('DOCX', () => {
  const rels = `<?xml version="1.0"?><Relationships>
    <Relationship Id="rId5" Type="http://x/image" Target="media/image1.jpeg"/>
    <Relationship Id="rId6" Type="http://x/image" Target="media/logo.png"/>
    <Relationship Id="rId7" Type="http://x/hyperlink" Target="https://example.com" TargetMode="External"/>
  </Relationships>`;
  const body = `<w:document><w:body>
    <w:p><w:r><w:drawing><a:blip r:embed="rId6"/></w:drawing></w:r></w:p>
    <w:p><w:r><w:t>Каталог &amp; виставка</w:t></w:r></w:p>
    <w:p><w:r><w:drawing><a:graphic><a:blip r:embed="rId5"/></a:graphic></w:drawing></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">«Квіти» </w:t></w:r><w:r><w:t>1937</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Автор</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>М. Примаченко</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r></w:p>
  </w:body></w:document>`;

  it('витягує текст, таблиці й маркери зображень; значки пропускає, повтори не дублює', () => {
    const doc = textOf(
      parseOfficeDocument(
        zip({
          'word/document.xml': body,
          'word/_rels/document.xml.rels': rels,
          'word/media/image1.jpeg': IMG,
          'word/media/logo.png': ICON,
        }),
        'docx',
      ),
    );
    expect(doc.text).toContain('Каталог & виставка');
    expect(doc.text).toContain('«Квіти» 1937');
    expect(doc.text).toMatch(/Автор\s*\|\s*М\. Примаченко/);
    expect(doc.text.match(/\[\[IMAGE 1\]\]/g)).toHaveLength(2);
    expect(doc.text).not.toContain('[[IMAGE 2]]');
    expect(doc.images).toHaveLength(1);
    expect(doc.images[0]!.blob.type).toBe('image/jpeg');
    expect(doc.images[0]!.name).toBe('image1.jpeg');
  });

  it('пошкоджений файл — зрозуміла помилка', () => {
    expect(() => parseOfficeDocument(new Uint8Array([1, 2, 3]), 'docx')).toThrow(DocumentError);
    expect(() => parseOfficeDocument(zip({ 'x.txt': 'x' }), 'docx')).toThrow(DocumentError);
  });
});

describe('PPTX', () => {
  it('слайди йдуть за номером, а не за абеткою; зображення з відносних шляхів', () => {
    const slide = (title: string, rel?: string) =>
      `<p:sld><p:sp><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:sp>${rel ? `<p:pic><a:blip r:embed="${rel}"/></p:pic>` : ''}</p:sld>`;
    const doc = textOf(
      parseOfficeDocument(
        zip({
          'ppt/slides/slide10.xml': slide('Десятий'),
          'ppt/slides/slide2.xml': slide('Другий', 'rId2'),
          'ppt/slides/_rels/slide2.xml.rels': '<Relationships><Relationship Id="rId2" Target="../media/image7.png"/></Relationships>',
          'ppt/media/image7.png': IMG,
        }),
        'pptx',
      ),
    );
    expect(doc.text.indexOf('Другий')).toBeLessThan(doc.text.indexOf('Десятий'));
    expect(doc.text).toContain('[[IMAGE 1]]');
    expect(doc.images[0]!.blob.type).toBe('image/png');
  });
});

describe('XLSX', () => {
  it('рядки таблиці зі спільними рядками й числами, порожні клітинки зберігають колонку', () => {
    const doc = textOf(
      parseOfficeDocument(
        zip({
          'xl/sharedStrings.xml': '<sst><si><t>Назва</t></si><si><t>Рік</t></si><si><r><t>Сон</t></r><r><t>ях</t></r></si></sst>',
          'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
            <row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>1888</v></c></row>
          </sheetData></worksheet>`,
        }),
        'xlsx',
      ),
    );
    expect(doc.text).toBe('Назва |  | Рік\nСонях |  | 1888');
  });
});

describe('ODT', () => {
  it('текст лише з тіла документа, без анотацій; зображення з Pictures/', () => {
    const doc = textOf(
      parseOfficeDocument(
        zip({
          'content.xml': `<office:document-content><office:automatic-styles><style:style>стиль</style:style></office:automatic-styles><office:body><office:text>
            <text:h>Виставка</text:h>
            <text:p>Перша<text:s text:c="2"/>картина<office:annotation><text:p>коментар</text:p></office:annotation></text:p>
            <draw:frame><draw:image xlink:href="Pictures/a.jpg"/></draw:frame>
          </office:text></office:body></office:document-content>`,
          'Pictures/a.jpg': IMG,
        }),
        'odt',
      ),
    );
    expect(doc.text).toMatch(/^Виставка\nПерша/);
    expect(doc.text).toContain('Перша  картина');
    expect(doc.text).not.toContain('коментар');
    expect(doc.text).not.toContain('стиль');
    expect(doc.images).toHaveLength(1);
  });
});
