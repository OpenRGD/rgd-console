import type { Metadata } from 'next';
import { RobotLive } from '@/components/robot-live';
export const metadata: Metadata = { title: 'OpenRGD Live · Robot Mode Preview' };
export default function LivePage() { return <RobotLive />; }
