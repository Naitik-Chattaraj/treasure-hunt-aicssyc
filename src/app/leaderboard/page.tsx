'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trophy, Medal, Clock, RefreshCw, Zap, ShieldCheck, ShieldAlert } from 'lucide-react';
import { LeaderboardEntry } from '@/types/hunt';
import ThemeToggle from '@/components/ThemeToggle';

interface ExtendedLeaderboardEntry extends LeaderboardEntry {
  updatedAt?: string | null;
}

export default function LeaderboardPage() {
  const [rawLeaderboard, setRawLeaderboard] = useState<ExtendedLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [now, setNow] = useState<number>(Date.now());

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

  return (
    <main className="min-h-screen bg-canvas text-ink flex flex-col font-mono relative overflow-x-hidden transition-colors">

      {/* Header */}
      <header className="z-10 bg-surface border-b border-primary/40 p-4 sm:p-5 flex justify-between items-center shadow-[0_0_25px_rgba(252,238,10,0.15)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 border-2 border-primary flex items-center justify-center bg-sunken text-primary shadow-[0_0_15px_rgba(252,238,10,0.3)]">
            <Trophy className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-primary uppercase">
                LIVE LEADERBOARD
              </h1>
              <span className="text-[10px] bg-primary/20 border border-primary text-primary px-2 py-0.5 font-bold uppercase animate-pulse">
                REALTIME
              </span>
            </div>
            <p className="text-xs text-gray-400">AICSSYC TREASURE HUNT 2026</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">LAST SYNC</div>
            <div className="text-xs text-accent font-bold">
              {lastUpdated.toLocaleTimeString()}
            </div>
          </div>
          <button
            onClick={() => fetchLeaderboard(true)}
            disabled={isRefreshing}
            className="p-2 border border-accent/40 bg-sunken hover:bg-accent/15 text-accent transition-colors flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
            title="Refresh Leaderboard"
            aria-label="Refresh Leaderboard"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">SYNC</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Leaderboard Body */}
      <div className="flex-1 p-4 sm:p-6 z-10 max-w-6xl w-full mx-auto space-y-6">
        
        {/* Top 3 Podium (if >= 3 approved teams) */}
        {leaderboard.filter(t => t.status === 'approved').length >= 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Rank 2 */}
            <div className="order-2 md:order-1 bg-surface border border-gray-400/50 p-4 relative flex flex-col justify-between shadow-md">
              <div className="flex justify-between items-start">
                <span className="text-xl font-bold text-gray-300">#02</span>
                <Medal className="w-6 h-6 text-gray-300" />
              </div>
              <div className="my-3">
                <h3 className="font-bold text-base text-ink truncate flex items-center gap-1.5">
                  {leaderboard[1].teamName}
                  {leaderboard[1].assignedRoute && (
                    <span className="text-[9px] bg-accent/15 text-accent border border-accent/40 px-1 py-0.2 font-mono">
                      R0{leaderboard[1].assignedRoute}
                    </span>
                  )}
                </h3>
                <div className="text-xs text-gray-400">Lead: {leaderboard[1].teamLead}</div>
              </div>
              <div className="pt-2 border-t border-line flex justify-between text-xs">
                <span className="text-accent font-bold">
                  {leaderboard[1].currentStage > 12 ? '🏆 VICTORY' : `NODE 0${leaderboard[1].currentStage}/12`}
                </span>
                <span className="text-gray-300 font-bold">
                  {formatElapsedDisplay(leaderboard[1].startTime, leaderboard[1].completedAt ?? leaderboard[1].completed_at, leaderboard[1].status, leaderboard[1].updatedAt)}
                </span>
              </div>
            </div>

            {/* Rank 1 (Gold) */}
            <div className="order-1 md:order-2 bg-surface border-2 border-primary p-5 relative flex flex-col justify-between shadow-[0_0_25px_rgba(252,238,10,0.25)] -mt-2">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary font-bold text-[10px] uppercase px-3 py-0.5 tracking-widest shadow-md flex items-center gap-1">
                <Trophy className="w-3 h-3" /> LEADER
              </div>
              <div className="flex justify-between items-start mt-1">
                <span className="text-2xl font-bold text-primary">#01</span>
                <Trophy className="w-7 h-7 text-primary animate-bounce" />
              </div>
              <div className="my-3">
                <h3 className="font-bold text-lg text-primary truncate flex items-center gap-1.5">
                  {leaderboard[0].teamName}
                  {leaderboard[0].assignedRoute && (
                    <span className="text-[9px] bg-primary/20 text-primary border border-primary/50 px-1 py-0.2 font-mono">
                      R0{leaderboard[0].assignedRoute}
                    </span>
                  )}
                </h3>
                <div className="text-xs text-gray-300">Lead: {leaderboard[0].teamLead}</div>
              </div>
              <div className="pt-3 border-t border-primary/40 flex justify-between text-xs">
                <span className="text-primary font-bold text-sm">
                  {leaderboard[0].currentStage > 12 ? '🏆 VICTORY' : `NODE 0${leaderboard[0].currentStage}/12`}
                </span>
                <span className="text-white font-bold text-sm">
                  {formatElapsedDisplay(leaderboard[0].startTime, leaderboard[0].completedAt ?? leaderboard[0].completed_at, leaderboard[0].status, leaderboard[0].updatedAt)}
                </span>
              </div>
            </div>

            {/* Rank 3 */}
            <div className="order-3 bg-surface border border-amber-600/50 p-4 relative flex flex-col justify-between shadow-md">
              <div className="flex justify-between items-start">
                <span className="text-xl font-bold text-amber-500">#03</span>
                <Medal className="w-6 h-6 text-amber-500" />
              </div>
              <div className="my-3">
                <h3 className="font-bold text-base text-ink truncate flex items-center gap-1.5">
                  {leaderboard[2].teamName}
                  {leaderboard[2].assignedRoute && (
                    <span className="text-[9px] bg-amber-500/15 text-amber-500 border border-amber-500/40 px-1 py-0.2 font-mono">
                      R0{leaderboard[2].assignedRoute}
                    </span>
                  )}
                </h3>
                <div className="text-xs text-gray-400">Lead: {leaderboard[2].teamLead}</div>
              </div>
              <div className="pt-2 border-t border-line flex justify-between text-xs">
                <span className="text-accent font-bold">
                  {leaderboard[2].currentStage > 12 ? '🏆 VICTORY' : `NODE 0${leaderboard[2].currentStage}/12`}
                </span>
                <span className="text-gray-300 font-bold">
                  {formatElapsedDisplay(leaderboard[2].startTime, leaderboard[2].completedAt ?? leaderboard[2].completed_at, leaderboard[2].status, leaderboard[2].updatedAt)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Master Ranking Table */}
        <div className="bg-surface border border-line overflow-hidden shadow-lg">
          <div className="p-4 border-b border-line flex justify-between items-center bg-sunken/60">
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Standings ({leaderboard.length} Teams)
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span>Real-time client calculated</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-sunken text-gray-400 uppercase tracking-wider border-b border-line">
                <tr>
                  <th className="p-4 w-16 text-center">Rank</th>
                  <th className="p-4">Team Name</th>
                  <th className="p-4">Team Lead</th>
                  <th className="p-4">Progress Bar</th>
                  <th className="p-4 text-center">Current Stage</th>
                  <th className="p-4 text-right">Elapsed Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {leaderboard.map((team, idx) => {
                  const rank = idx + 1;
                  const isDisqualified = team.status === 'rejected';
                  const isWinner = team.currentStage > 12;
                  const progressPercent = Math.min(100, Math.round(((team.currentStage - 1) / 12) * 100));

                  return (
                    <tr 
                      key={team.id} 
                      className={`hover:bg-sunken/80 transition-colors ${
                        isDisqualified
                          ? 'bg-danger/5 opacity-70'
                          : rank === 1
                          ? 'bg-primary/5'
                          : ''
                      }`}
                    >
                      <td className="p-4 text-center font-bold text-sm">
                        {isDisqualified ? (
                          <span className="text-danger font-bold">DQ</span>
                        ) : rank === 1 ? (
                          <span className="text-primary font-bold flex items-center justify-center gap-1">
                            🥇 #1
                          </span>
                        ) : rank === 2 ? (
                          <span className="text-gray-300 font-bold">🥈 #2</span>
                        ) : rank === 3 ? (
                          <span className="text-amber-500 font-bold">🥉 #3</span>
                        ) : (
                          <span className="text-gray-400">#{rank}</span>
                        )}
                      </td>

                      <td className="p-4 font-bold text-sm text-ink">
                        <div className="flex items-center gap-2">
                          <span className={isDisqualified ? 'text-danger line-through' : rank === 1 ? 'text-primary' : ''}>
                            {team.teamName}
                          </span>
                          {team.assignedRoute && (
                            <span className="text-[9px] bg-accent/15 text-accent border border-accent/40 px-1 py-0.2 font-mono">
                              R0{team.assignedRoute}
                            </span>
                          )}
                          {isDisqualified ? (
                            <span className="text-[9px] bg-danger/20 text-danger border border-danger/50 px-1.5 py-0.2 font-bold uppercase flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> DISQUALIFIED
                            </span>
                          ) : isWinner ? (
                            <span className="text-[9px] bg-green-500/20 text-green-400 border border-green-500/50 px-1.5 py-0.2 font-bold uppercase">
                              VICTOR
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="p-4 text-gray-300">{team.teamLead}</td>

                      <td className="p-4 w-48">
                        <div className="w-full bg-sunken h-2 rounded-full overflow-hidden border border-line/80">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              isDisqualified
                                ? 'bg-danger/60'
                                : isWinner
                                ? 'bg-green-400'
                                : 'bg-gradient-to-r from-accent to-primary'
                            }`}
                            style={{ width: `${isDisqualified ? 100 : isWinner ? 100 : progressPercent}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          {isDisqualified ? 'Disqualified' : isWinner ? '12/12 Cleared' : `${team.currentStage - 1}/12 Cleared`}
                        </div>
                      </td>

                      <td className="p-4 text-center font-bold">
                        {isDisqualified ? (
                          <span className="text-danger flex items-center justify-center gap-1">
                            <ShieldAlert className="w-4 h-4" />
                            ELIMINATED
                          </span>
                        ) : isWinner ? (
                          <span className="text-green-400 flex items-center justify-center gap-1">
                            <ShieldCheck className="w-4 h-4" />
                            COMPLETED
                          </span>
                        ) : (
                          <span className="text-accent">NODE 0{team.currentStage}</span>
                        )}
                      </td>

                      <td className={`p-4 text-right font-bold text-sm ${isDisqualified ? 'text-danger/80' : 'text-primary'}`}>
                        {formatElapsedDisplay(
                          team.startTime,
                          team.completedAt ?? team.completed_at,
                          team.status,
                          team.updatedAt
                        )}
                      </td>
                    </tr>
                  );
                })}

                {leaderboard.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-gray-500 font-mono">
                      No active teams yet. Teams appear here once approved by organizers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
