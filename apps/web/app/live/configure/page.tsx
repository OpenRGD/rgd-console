import type { Metadata } from 'next';
import { LiveConfigurator } from '@/components/live-configurator';
export const metadata: Metadata = { title: 'OpenRGD Live · Display Profiles' };
export default function LiveConfigurePage() { return <LiveConfigurator />; }
