import type { Metadata } from 'next';
import { BootDashboard } from '@/components/boot-dashboard';
export const metadata: Metadata = { title: 'OpenRGD Boot Manager · Recovery' };
export default function BootPage() { return <BootDashboard />; }
