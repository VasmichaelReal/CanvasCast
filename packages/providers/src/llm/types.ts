import type { GeneratedDescription, ImportResult, Lang, PaintingFacts } from '@canvascast/core';

export interface DescribeInput {
  /** JPEG, уже зменшений до розумного розміру */
  image: Buffer;
  lang: Lang;
  facts: PaintingFacts;
}

/** Документ для імпорту: або витягнутий текст із маркерами зображень, або файл (PDF). */
export interface ExtractInput {
  lang: Lang;
  fileName?: string;
  text?: string;
  file?: { mimeType: string; data: Buffer };
  /** Скільки зображень витягнуто з документа (маркери [[IMAGE n]] у тексті). */
  imageCount: number;
}

export interface LLMProvider {
  readonly name: string;
  describe(input: DescribeInput): Promise<GeneratedDescription>;
  /** Розкладає документ на картки картин для перевірки власником. */
  extractPaintings(input: ExtractInput): Promise<ImportResult>;
}
