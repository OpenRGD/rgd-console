import type { Metadata } from 'next';
import { VisualEffectsStudio } from '@/components/visual-effects-studio';

export const metadata: Metadata = {
  title: 'Visual Effects Studio · OpenRGD',
  description: 'Studio di matching fra eventi robotici e scene luminose — anteprima locale non attuativa',
};

export default function VisualEffectsPage() {
  return <VisualEffectsStudio />;
}
