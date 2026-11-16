import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '@canvascast/core';

let client: S3Client | undefined;
let bucketReady: Promise<void> | undefined;

function s3(): S3Client {
  if (!client) {
    const cfg = env.s3;
    client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: true, // потрібно для локального S3-сховища; R2 і S3 теж це підтримують
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    });
  }
  return client;
}

/** Створює бакет, якщо його ще немає (зручно для локального сховища). */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const Bucket = env.s3.bucket;
    try {
      await s3().send(new HeadBucketCommand({ Bucket }));
    } catch {
      try {
        await s3().send(new CreateBucketCommand({ Bucket }));
      } catch (err) {
        const name = (err as { name?: string }).name;
        if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw err;
      }
    }
  })().catch((err) => {
    bucketReady = undefined; // наступний виклик спробує знову
    throw err;
  });
  return bucketReady;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await s3().send(
    new PutObjectCommand({ Bucket: env.s3.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number;
  /** Заповнено, якщо запитували діапазон: "bytes 0-99/1234". */
  contentRange?: string;
}

/** Повертає null, якщо об'єкта немає. `range` — значення HTTP-заголовка Range. */
export async function getObject(key: string, range?: string): Promise<StoredObject | null> {
  await ensureBucket();
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: env.s3.bucket, Key: key, Range: range }),
    );
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
      contentType: res.ContentType ?? 'application/octet-stream',
      contentLength: res.ContentLength ?? 0,
      contentRange: res.ContentRange,
    };
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw err;
  }
}

export async function getObjectBuffer(key: string): Promise<Buffer | null> {
  await ensureBucket();
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    if (!res.Body) return null;
    return Buffer.from(await res.Body.transformToByteArray());
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw err;
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return;
  await ensureBucket();
  for (let i = 0; i < unique.length; i += 1000) {
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: env.s3.bucket,
        Delete: { Objects: unique.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}

/** Видаляє все під префіксом (усі файли картини чи галереї). */
export async function deletePrefix(prefix: string): Promise<void> {
  await ensureBucket();
  let ContinuationToken: string | undefined;
  do {
    const page = await s3().send(
      new ListObjectsV2Command({ Bucket: env.s3.bucket, Prefix: prefix, ContinuationToken }),
    );
    await deleteObjects((page.Contents ?? []).map((o) => o.Key ?? ''));
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
}
