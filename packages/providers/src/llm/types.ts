import type { GeneratedDescription, Lang, PaintingFacts } from '@canvascast/core';

export interface DescribeInput {
  /** JPEG, уже зменшений до розумного розміру */
  image: Buffer;
  lang: Lang;
  facts: PaintingFacts;
}

export interface LLMProvider {
  readonly name: string;
  describe(input: DescribeInput): Promise<GeneratedDescription>;
}
