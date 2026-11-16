import type { Metadata } from 'next';
import { Editor } from '@/components/Editor';

export const metadata: Metadata = { title: 'Редактор галереї' };

export default async function EditorPage({ params }: { params: Promise<{ editToken: string }> }) {
  const { editToken } = await params;
  return <Editor editToken={editToken} />;
}
