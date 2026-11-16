import { env, mediaUrl, type Lang, type PublicGallery } from '@canvascast/core';
import { prisma, type Gallery } from '@canvascast/db';

export interface EditorDescription {
  id: string;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  text: string;
  textEdited: boolean;
  uncertain: string[];
  error: string | null;
  audioUrl: string | null;
  audioDuration: number | null;
}

export interface EditorPainting {
  id: string;
  title: string | null;
  author: string | null;
  year: string | null;
  technique: string | null;
  context: string | null;
  imageUrl: string;
  thumbUrl: string;
  description: EditorDescription | null;
}

export interface EditorGallery {
  name: string;
  lang: Lang;
  version: number;
  viewUrl: string;
  /** true, коли AI-модель не підключено й описи — демонстраційні */
  demoMode: boolean;
  paintings: EditorPainting[];
}

function isDemoMode(): boolean {
  return env.llmProvider === 'mock' || (env.llmProvider === 'auto' && !env.geminiApiKey);
}

export async function editorGallery(gallery: Gallery, origin: string): Promise<EditorGallery> {
  const paintings = await prisma.painting.findMany({
    where: { galleryId: gallery.id },
    orderBy: { position: 'asc' },
    include: { descriptions: { where: { lang: gallery.lang } } },
  });
  return {
    name: gallery.name,
    lang: gallery.lang,
    version: gallery.version,
    viewUrl: `${origin}/g/${gallery.viewToken}`,
    demoMode: isDemoMode(),
    paintings: paintings.map((p) => {
      const d = p.descriptions[0];
      return {
        id: p.id,
        title: p.title,
        author: p.author,
        year: p.year,
        technique: p.technique,
        context: p.context,
        imageUrl: mediaUrl(p.imageKey),
        thumbUrl: mediaUrl(p.thumbKey),
        description: d
          ? {
              id: d.id,
              status: d.status,
              text: d.text,
              textEdited: d.textEdited,
              uncertain: d.uncertain,
              error: d.error,
              // Аудіо показуємо, лише коли воно відповідає поточному тексту.
              audioUrl: d.status === 'ready' && d.audioKey ? mediaUrl(d.audioKey) : null,
              audioDuration: d.status === 'ready' ? d.audioDuration : null,
            }
          : null,
      };
    }),
  };
}

/** Те, що бачить відвідувач: лише картини, для яких уже є текст опису. */
export async function publicGallery(gallery: Gallery): Promise<PublicGallery> {
  const paintings = await prisma.painting.findMany({
    where: { galleryId: gallery.id, descriptions: { some: { lang: gallery.lang, text: { not: '' } } } },
    orderBy: { position: 'asc' },
    include: { descriptions: { where: { lang: gallery.lang } } },
  });
  return {
    name: gallery.name,
    lang: gallery.lang,
    version: gallery.version,
    paintings: paintings.map((p) => {
      const d = p.descriptions[0]!;
      const audioReady = d.status === 'ready' && d.audioKey;
      return {
        id: p.id,
        title: p.title,
        author: p.author,
        year: p.year,
        technique: p.technique,
        imageUrl: mediaUrl(p.imageKey),
        thumbUrl: mediaUrl(p.thumbKey),
        text: d.text,
        audioUrl: audioReady ? mediaUrl(d.audioKey!) : null,
        audioDuration: audioReady ? d.audioDuration : null,
      };
    }),
  };
}
