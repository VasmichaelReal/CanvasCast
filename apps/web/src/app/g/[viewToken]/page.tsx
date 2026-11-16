import type { Metadata } from 'next';
import { Viewer } from '@/components/Viewer';

export const metadata: Metadata = { title: 'Аудіогід' };

export default async function ViewerPage({ params }: { params: Promise<{ viewToken: string }> }) {
  const { viewToken } = await params;
  return <Viewer viewToken={viewToken} />;
}
