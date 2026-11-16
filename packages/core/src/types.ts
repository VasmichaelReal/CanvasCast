export const LANGS = ['uk', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DESCRIPTION_STATUSES = ['pending', 'generating', 'ready', 'failed'] as const;
export type DescriptionStatus = (typeof DESCRIPTION_STATUSES)[number];

/** Факти про картину, надані власником. Пріоритетне джерело фактів для LLM. */
export interface PaintingFacts {
  title?: string | null;
  author?: string | null;
  year?: string | null;
  technique?: string | null;
  context?: string | null;
}

/** Що бачить відвідувач: відповідь GET /api/v/:viewToken/gallery. */
export interface PublicGallery {
  name: string;
  lang: Lang;
  /** Зростає з кожною зміною вмісту; за ним офлайн-копія розуміє, що застаріла. */
  version: number;
  paintings: PublicPainting[];
}

export interface PublicPainting {
  id: string;
  title: string | null;
  author: string | null;
  year: string | null;
  technique: string | null;
  imageUrl: string;
  thumbUrl: string;
  text: string;
  audioUrl: string | null;
  audioDuration: number | null;
}
