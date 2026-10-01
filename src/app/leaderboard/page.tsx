'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckCircle2, Clock, Medal, RefreshCw, ShieldAlert, Trophy } from 'lucide-react';
import { LeaderboardEntry } from '@/types/hunt';
import ThemeToggle from '@/components/ThemeToggle';

interface ExtendedLeaderboardEntry extends LeaderboardEntry {
  updatedAt?: string | null;
}

export default function LeaderboardPage() {
  const [rawLeaderboard, setRawLeaderboard] = useState<ExtendedLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState<number>(0);

  const fetchLeaderboard = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setRawLeaderboard(data.leaderboard || []);
        setLastUpdated(new Date());
      }
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  // Poll every 10s when tab is visible, pause when hidden to save database requests
  useEffect(() => {
    setNow(Date.now());
    setLastUpdated(new Date());
    fetchLeaderboard();

    let pollInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (!pollInterval) {
        pollInterval = setInterval(() => {
          fetchLeaderboard();
        }, 10000);
      }
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLeaderboard();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Live second tick for smooth real-time timer updates without sending database requests
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(clockInterval);
    };
  }, [fetchLeaderboard]);

  // Client-side elapsed time calculation (in seconds)
  const calculateElapsedSeconds = useCallback((
    startTime: string | null,
    completedAt: string | null | undefined,
    status: string,
    updatedAt: string | null | undefined,
    currentTime: number
  ): number | null => {
    if (!startTime) return null;
    const start = new Date(startTime).getTime();
    if (isNaN(start)) return null;

    let end: number;
    if (completedAt) {
      end = new Date(completedAt).getTime();
    } else if (status === 'rejected') {
      // Disqualification / rejected timing: lock elapsed time at updatedAt or fallback to start
      end = updatedAt ? new Date(updatedAt).getTime() : start;
    } else {
      end = currentTime;
    }

    if (isNaN(end)) end = currentTime;
    return Math.max(0, Math.floor((end - start) / 1000));
  }, []);

  // Live dynamic sorting calculated on the frontend
  const leaderboard = useMemo(() => {
    const list = rawLeaderboard.map((team) => ({
      ...team,
      computedElapsedSeconds: calculateElapsedSeconds(
        team.startTime,
        team.completedAt ?? team.completed_at,
        team.status,
        team.updatedAt,
        now
      ),
    }));

    list.sort((a, b) => {
      // 1. Approved teams first, Disqualified/Rejected teams last
      if (a.status === 'approved' && b.status === 'rejected') return -1;
      if (a.status === 'rejected' && b.status === 'approved') return 1;

      // 2. Stage (descending - furthest ahead first)
      if (b.currentStage !== a.currentStage) {
        return b.currentStage - a.currentStage;
      }

      // 3. Elapsed seconds (ascending - fastest first, null last)
      if (a.computedElapsedSeconds === null && b.computedElapsedSeconds !== null) return 1;
      if (a.computedElapsedSeconds !== null && b.computedElapsedSeconds === null) return -1;
      if (
        a.computedElapsedSeconds !== null &&
        b.computedElapsedSeconds !== null &&
        a.computedElapsedSeconds !== b.computedElapsedSeconds
      ) {
        return a.computedElapsedSeconds - b.computedElapsedSeconds;
      }

      // 4. Completed at (ascending - earliest completion first, null last)
      const aComp = a.completedAt ?? a.completed_at;
      const bComp = b.completedAt ?? b.completed_at;
      if (aComp && bComp) {
        const aTime = new Date(aComp).getTime();
        const bTime = new Date(bComp).getTime();
        if (!isNaN(aTime) && !isNaN(bTime) && aTime !== bTime) {
          return aTime - bTime;
        }
      } else if (aComp && !bComp) {
        return -1;
      } else if (!aComp && bComp) {
        return 1;
      }

      // 5. Stable deterministic tie-breaker: ID
      return String(a.id).localeCompare(String(b.id));
    });

    return list;
  }, [rawLeaderboard, now, calculateElapsedSeconds]);

  // Formatter for elapsed time display
  const formatElapsedDisplay = (
    startTime: string | null,
    completedAt: string | null | undefined,
    status: string,
    updatedAt: string | null | undefined
  ) => {
    if (!startTime) return '--:--:--';
    const diff = calculateElapsedSeconds(startTime, completedAt, status, updatedAt, now);
    if (diff === null) return '--:--:--';
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  type Team = (typeof leaderboard)[number];
  const timeFor = (team: Team) =>
    formatElapsedDisplay(team.startTime, team.completedAt ?? team.completed_at, team.status, team.updatedAt);
  const stageText = (stage: number) => (stage > 12 ? 'Finished' : `Checkpoint ${stage}/12`);

  const routeBadge = (route?: 1 | 2) =>
    route ? (
      <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
        route === 1 ? 'border-route-1/50 bg-route-1/10 text-route-1' : 'border-route-2/50 bg-route-2/10 text-route-2'
      }`}>
        Route {route}
      </span>
    ) : null;

  const podiumOrder = [
    { idx: 1, place: 2, className: 'order-2 md:order-1' },
    { idx: 0, place: 1, className: 'order-1 md:order-2 md:-mt-3' },
    { idx: 2, place: 3, className: 'order-3' },
  ];

  return (
    <main className="bg-map flex min-h-dvh flex-col text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Trophy className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold sm:text-2xl">Leaderboard</h1>
              <p className="truncate text-sm text-muted">AICSSYC Treasure Hunt 2026</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="text-right text-xs leading-tight">
              <div className="flex items-center justify-end gap-1.5 font-semibold text-success">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" /> Live
              </div>
              <div className="font-mono text-muted tabular-nums">{lastUpdated ? lastUpdated.toLocaleTimeString() : '--:--:--'}</div>
            </div>
            <button
              onClick={() => fetchLeaderboard(true)}
              disabled={isRefreshing}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-60 cursor-pointer sm:px-3"
              title="Refresh leaderboard"
              aria-label="Refresh leaderboard"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {leaderboard.filter(t => t.status === 'approved').length >= 3 && (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end md:gap-4 md:pt-3" aria-label="Top three teams">
            {podiumOrder.map(({ idx, place, className }) => {
              const team = leaderboard[idx];
              const isFirst = place === 1;
              return (
                <div
                  key={team.id}
                  className={`${className} relative rounded-xl border bg-surface p-4 shadow-card ${
                    isFirst ? 'border-primary/60 sm:p-5' : 'border-line'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-full font-mono text-sm font-bold ${
                      isFirst ? 'bg-primary text-on-primary' : 'bg-surface-2 text-ink'
                    }`}>
                      {place}
                    </span>
                    {isFirst ? (
                      <Trophy className="h-6 w-6 text-primary" aria-label="Leader" />
                    ) : (
                      <Medal className="h-6 w-6 text-muted" aria-label={place === 2 ? 'Second place' : 'Third place'} />
                    )}
                  </div>
                  <div className="my-3 min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className={`truncate font-semibold ${isFirst ? 'text-lg' : 'text-base'}`}>{team.teamName}</h3>
                      {routeBadge(team.assignedRoute)}
                    </div>
                    <div className="truncate text-sm text-muted">Lead: {team.teamLead}</div>
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
                    <span className={team.currentStage > 12 ? 'font-semibold text-success' : 'text-muted'}>{stageText(team.currentStage)}</span>
                    <span className={`font-mono font-semibold tabular-nums ${isFirst ? 'text-primary' : ''}`}>{timeFor(team)}</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="font-semibold">Standings <span className="text-muted">({leaderboard.length} teams)</span></h2>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Clock className="h-4 w-4" aria-hidden="true" />
              Ranked by progress, then time
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-sunken text-xs text-muted">
                <tr>
                  <th scope="col" className="w-14 px-3 py-3 text-center font-medium sm:px-4">Rank</th>
                  <th scope="col" className="px-3 py-3 font-medium sm:px-4">Team</th>
                  <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Team lead</th>
                  <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">Progress</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium sm:px-4">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leaderboard.map((team, idx) => {
                  const rank = idx + 1;
                  const isDisqualified = team.status === 'rejected';
                  const isWinner = team.currentStage > 12;
                  const progressPercent = Math.min(100, Math.round(((team.currentStage - 1) / 12) * 100));

                  return (
                    <tr
                      key={team.id}
                      className={`transition-colors hover:bg-surface-2 ${
                        isDisqualified ? 'bg-danger/5 opacity-75' : rank === 1 ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-center sm:px-4">
                        {isDisqualified ? (
                          <span className="font-mono text-xs font-semibold text-danger" title="Disqualified">DQ</span>
                        ) : (
                          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-semibold ${
                            rank === 1 ? 'bg-primary text-on-primary' : rank <= 3 ? 'bg-surface-2 text-ink' : 'text-muted'
                          }`}>
                            {rank}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 sm:px-4">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={`font-semibold ${isDisqualified ? 'text-danger line-through' : ''}`}>{team.teamName}</span>
                          {routeBadge(team.assignedRoute)}
                          {isDisqualified ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-xs font-semibold text-danger">
                              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> Disqualified
                            </span>
                          ) : isWinner && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-success/15 px-1.5 py-0.5 text-xs font-semibold text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Finished
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted sm:hidden">
                          {isDisqualified ? 'Disqualified' : stageText(team.currentStage)}
                        </div>
                      </td>

                      <td className="hidden px-4 py-3 text-muted md:table-cell">{team.teamLead}</td>

                      <td className="hidden w-48 px-4 py-3 sm:table-cell">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isDisqualified ? 'bg-danger/60' : isWinner ? 'bg-success' : 'bg-primary'
                            }`}
                            style={{ width: `${isDisqualified || isWinner ? 100 : progressPercent}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {isDisqualified ? 'Disqualified' : `${isWinner ? 12 : team.currentStage - 1}/12 found`}
                        </div>
                      </td>

                      <td className={`px-3 py-3 text-right font-mono font-semibold tabular-nums sm:px-4 ${isDisqualified ? 'text-danger' : ''}`}>
                        {timeFor(team)}
                      </td>
                    </tr>
                  );
                })}

                {leaderboard.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted">
                      No teams on the board yet. Teams appear here once organizers approve them.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
