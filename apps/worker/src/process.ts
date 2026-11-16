import sharp from 'sharp';
import { buildSpeechText, checkFactsInText, storageKeys } from '@canvascast/core';
import { prisma } from '@canvascast/db';
import type { LLMProvider, TtsProvider } from '@canvascast/providers';
import type { GenerationJobData } from '@canvascast/queue';
import { deleteObjects, getObjectBuffer, putObject } from '@canvascast/storage';

export interface Providers {
  llm: LLMProvider;
  tts: TtsProvider;
}

/** Найбільша сторона зображення, яке йде в модель: достатньо для деталей, дешево за токенами. */
const LLM_IMAGE_MAX_SIDE = 1568;

/**
 * Одна задача генерації: (опис →) озвучення → збереження.
 * Кидає помилку при збої — повторами керує BullMQ.
 * Ідемпотентна: повторний запуск просто перезаписує результат того самого Description.
 */
export async function processGeneration(data: GenerationJobData, providers: Providers): Promise<void> {
  const description = await prisma.description.findUnique({
    where: { id: data.descriptionId },
    include: { painting: true },
  });
  // Картину могли видалити, поки задача чекала в черзі — це не помилка.
  if (!description) return;
  const { painting } = description;

  await prisma.description.update({
    where: { id: description.id },
    data: { status: 'generating', error: null },
  });

  let text = description.text;
  let title = painting.title;

  if (data.type === 'full') {
    const original = await getObjectBuffer(painting.imageKey);
    if (!original) throw new Error('Зображення картини не знайдено у сховищі');
    const image = await sharp(original)
      .resize(LLM_IMAGE_MAX_SIDE, LLM_IMAGE_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const generated = await providers.llm.describe({
      image,
      lang: description.lang,
      facts: painting,
    });
    text = generated.description;
    // Назву від моделі беремо лише тоді, коли власник своєї не дав.
    title = painting.title || generated.suggestedTitle || null;

    // Текст зберігаємо одразу: якщо озвучення впаде, повтор не втратить опис,
    // а власник уже бачить його в редакторі.
    await prisma.$transaction([
      prisma.description.update({
        where: { id: description.id },
        data: {
          text,
          textEdited: false,
          uncertain: [...generated.uncertain, ...checkFactsInText(painting, text)],
        },
      }),
      ...(title !== painting.title
        ? [prisma.painting.update({ where: { id: painting.id }, data: { title } })]
        : []),
    ]);
  }

  if (!text.trim()) throw new Error('Немає тексту для озвучення');

  // Перед описом диктор називає картину: назва, автор, рік, техніка — дослівно від власника.
  const speech = await providers.tts.synthesize({
    text: buildSpeechText({ ...painting, title }, text),
    lang: description.lang,
  });
  const audioKey = storageKeys.audio(painting.galleryId, painting.id, description.lang, speech.ext);
  await putObject(audioKey, speech.audio, speech.mime);

  await prisma.$transaction([
    prisma.description.update({
      where: { id: description.id },
      data: { audioKey, audioDuration: speech.durationSec, status: 'ready', error: null },
    }),
    prisma.gallery.update({ where: { id: painting.galleryId }, data: { version: { increment: 1 } } }),
  ]);

  // Старе аудіо прибираємо лише після того, як нове збережено й записано в БД.
  if (description.audioKey && description.audioKey !== audioKey) {
    await deleteObjects([description.audioKey]).catch(() => {});
  }
}
