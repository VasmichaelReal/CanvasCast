import QRCode from 'qrcode';
import { NOT_FOUND, baseUrl, findGalleryForEdit } from '@/lib/api';

type Ctx = { params: Promise<{ editToken: string }> };

/** QR-код посилання для відвідувачів (SVG — друкується в будь-якому розмірі). */
export async function GET(req: Request, { params }: Ctx) {
  const gallery = await findGalleryForEdit((await params).editToken);
  if (!gallery) return NOT_FOUND();

  const svg = await QRCode.toString(`${baseUrl(req)}/g/${gallery.viewToken}`, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
  });
  const download = new URL(req.url).searchParams.has('download');
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(download ? { 'Content-Disposition': 'attachment; filename="canvascast-qr.svg"' } : {}),
    },
  });
}
