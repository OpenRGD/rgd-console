import { notFound } from 'next/navigation';
import { ConsoleShell } from '@/components/console-shell';
import { SECTIONS, type SectionId } from '@/lib/navigation';

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!SECTIONS.some(item => item.id === section)) notFound();
  return <ConsoleShell section={section as SectionId} />;
}
