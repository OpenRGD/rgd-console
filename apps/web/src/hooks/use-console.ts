'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, streamUrl } from '@/lib/api';
import {
  isConsoleEvent, isTelemetrySnapshot, isImuObservation,
  type ImuObservation, type ConsoleEvent, type ConsoleStatus, type ModuleManifest,
  type RobotRecord, type StreamFrame, type TelemetrySnapshot,
} from '@/lib/contracts';

export type StreamStatus = 'connecting' | 'live' | 'offline';

export function useConsole() {
  const [robots, setRobots] = useState<RobotRecord[]>([]);
  const [selectedId, setSelectedId] = useState('sim-lab-01');
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);
  const [imu, setImu] = useState<ImuObservation | null>(null);
  const [history, setHistory] = useState<TelemetrySnapshot[]>([]);
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [modules, setModules] = useState<ModuleManifest[]>([]);
  const [status, setStatus] = useState<ConsoleStatus | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const init = async () => {
      try {
        const list = await apiGet<RobotRecord[]>('/robots', controller.signal);
        if (controller.signal.aborted) return;
        setRobots(list);
        const stored = localStorage.getItem('openrgd.console.robot');
        setSelectedId(list.find(x => x.id === stored)?.id ?? list[0]?.id ?? 'sim-lab-01');
        setApiError(null);
      } catch {
        if (!controller.signal.aborted) setApiError('API non raggiungibile. Verifica il backend e il gateway locale.');
      }
    };
    void init();
    void apiGet<ModuleManifest[]>('/modules', controller.signal).then(setModules).catch(() => {});
    void apiGet<ConsoleStatus>('/status', controller.signal).then(setStatus).catch(() => {});
    return () => controller.abort();
  }, []);

  const refreshRobots = useCallback(async (preferredId?: string) => {
    const list = await apiGet<RobotRecord[]>('/robots');
    setRobots(list);
    if (preferredId && list.some(item => item.id === preferredId)) {
      localStorage.setItem('openrgd.console.robot', preferredId);
      setSelectedId(preferredId);
      setSnapshot(null);
      setImu(null);
      setHistory([]);
      setEvents([]);
    }
  }, []);

  const selectRobot = useCallback((id: string) => {
    if (!robots.some(robot => robot.id === id)) return;
    localStorage.setItem('openrgd.console.robot', id);
    setSnapshot(null);
    setImu(null);
    setHistory([]);
    setEvents([]);
    setSelectedId(id);
  }, [robots]);

  useEffect(() => {
    if (!robots.some(robot => robot.id === selectedId)) return;
    const abort = new AbortController();
    let active = true;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    setStreamStatus('connecting');
    void apiGet<TelemetrySnapshot>(`/robots/${encodeURIComponent(selectedId)}/telemetry`, abort.signal)
      .then(value => { if (active && isTelemetrySnapshot(value)) setSnapshot(value); }).catch(() => {});
    void apiGet<ImuObservation | null>(`/robots/${encodeURIComponent(selectedId)}/imu`, abort.signal)
      .then(value => { if (active) setImu(isImuObservation(value) ? value : null); }).catch(() => {});
    void apiGet<ConsoleEvent[]>(`/events?robot_id=${encodeURIComponent(selectedId)}&limit=80`, abort.signal)
      .then(value => { if (active) setEvents(value.filter(isConsoleEvent)); }).catch(() => {});

    const connect = () => {
      if (!active) return;
      socket = new WebSocket(streamUrl(selectedId));
      socket.onopen = () => { if (active) { setStreamStatus('live'); setApiError(null); } };
      socket.onmessage = message => {
        if (!active) return;
        try {
          const frame = JSON.parse(String(message.data)) as StreamFrame;
          if (frame.schema_version !== 'console.v1' || frame.robot_id !== selectedId) return;
          if (frame.type === 'telemetry' && isTelemetrySnapshot(frame.data)) {
            setSnapshot(frame.data);
            setHistory(old => [...old, frame.data as TelemetrySnapshot].slice(-60));
          }
          if (frame.type === 'imu' && isImuObservation(frame.data)) {
            setImu(frame.data);
          }
          if (frame.type === 'event' && isConsoleEvent(frame.data)) {
            setEvents(previous => [frame.data as ConsoleEvent, ...previous.filter(x => x.event_id !== (frame.data as ConsoleEvent).event_id)].slice(0,80));
          }
        } catch { /* Discard malformed frames; never interpret them as valid telemetry. */ }
      };
      socket.onerror = () => { if (active) setStreamStatus('offline'); };
      socket.onclose = () => {
        if (!active) return;
        setStreamStatus('offline');
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      active = false;
      abort.abort();
      if (retry) clearTimeout(retry);
      if (socket) { socket.onclose = null; socket.close(); }
    };
  }, [robots, selectedId]);

  const selectedRobot = useMemo(() => robots.find(r => r.id === selectedId) ?? null, [robots, selectedId]);
  return { robots, selectedRobot, selectRobot, refreshRobots, snapshot, imu, history, events, modules, status, streamStatus, apiError };
}
