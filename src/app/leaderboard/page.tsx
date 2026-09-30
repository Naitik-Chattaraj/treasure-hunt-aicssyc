'use client';

import { useState, useEffect } from 'react';
import { Trophy, Medal, Clock, Radio, RefreshCw, Zap, ShieldCheck } from 'lucide-react';
import { LeaderboardEntry } from '@/types/hunt';
import ThemeToggle from '@/components/ThemeToggle';

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [now, setNow] = useState<number>(Date.now());

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
        setLastUpdated(new Date());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    // Auto-refresh leaderboard data every 5s
    const pollInterval = setInterval(fetchLeaderboard, 5000);
    // Live second tick for elapsed timers
    const clockInterval = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const formatElapsed = (startTime: string | null, completedAt: string | null) => {
    if (!startTime) return '--:--:--';
    const start = new Date(startTime).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : now;
    const diff = Math.max(0, Math.floor((end - start) / 1000));
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <main className="min-h-screen bg-cyber-dark text-foreground flex flex-col font-mono relative overflow-x-hidden transition-colors">
      <div className="overlay-scanlines"></div>

      {/* Header */}
      <header className="z-10 bg-cyber-panel border-b border-cyber-yellow/40 p-4 sm:p-5 flex justify-between items-center shadow-[0_0_25px_rgba(252,238,10,0.15)]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 border-2 border-cyber-yellow flex items-center justify-center bg-cyber-darker text-cyber-yellow shadow-[0_0_15px_rgba(252,238,10,0.3)]">
            <Trophy className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-widest text-cyber-yellow uppercase cyber-glitch-text">
                LIVE LEADERBOARD
              </h1>
              <span className="text-[10px] bg-cyber-yellow/20 border border-cyber-yellow text-cyber-yellow px-2 py-0.5 font-bold uppercase animate-pulse">
                REALTIME
              </span>
            </div>
            <p className="text-xs text-gray-400">AICSSYC TREASURE HUNT 2026</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">LAST UPDATED</div>
            <div className="text-xs text-cyber-cyan font-bold">
              {lastUpdated.toLocaleTimeString()}
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Leaderboard Body */}
      <div className="flex-1 p-4 sm:p-6 z-10 max-w-6xl w-full mx-auto space-y-6">
        
        {/* Top 3 Podium (if >= 3 teams) */}
        {leaderboard.length >= 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Rank 2 */}
            <div className="order-2 md:order-1 bg-cyber-panel border border-gray-400/50 p-4 relative flex flex-col justify-between shadow-md">
              <div className="flex justify-between items-start">
                <span className="text-xl font-bold text-gray-300">#02</span>
                <Medal className="w-6 h-6 text-gray-300" />
              </div>
              <div className="my-3">
                <h3 className="font-bold text-base text-foreground truncate flex items-center gap-1.5">
                  {leaderboard[1].teamName}
                  {leaderboard[1].assignedRoute && (
                    <span className="text-[9px] bg-cyber-blue/15 text-cyber-blue border border-cyber-blue/40 px-1 py-0.2 font-mono">
                      R0{leaderboard[1].assignedRoute}
                    </span>
                  )}
                </h3>
                <div className="text-xs text-gray-400">Lead: {leaderboard[1].teamLead}</div>
              </div>
              <div className="pt-2 border-t border-cyber-border flex justify-between text-xs">
                <span className="text-cyber-cyan font-bold">
                  {leaderboard[1].currentStage > 12 ? 'VICTORY' : `NODE 0${leaderboard[1].currentStage}/12`}
                </span>
                <span className="text-gray-300 font-bold">{formatElapsed(leaderboard[1].startTime, leaderboard[1].completedAt)}</span>
              </div>
            </div>

            {/* Rank 1 (Gold) */}
            <div className="order-1 md:order-2 bg-cyber-panel border-2 border-cyber-yellow p-5 relative flex flex-col justify-between shadow-[0_0_25px_rgba(252,238,10,0.25)] -mt-2">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyber-yellow text-cyber-dark font-bold text-[10px] uppercase px-3 py-0.5 tracking-widest shadow-md flex items-center gap-1">
                <Trophy className="w-3 h-3" /> LEADER
              </div>
              <div className="flex justify-between items-start mt-1">
                <span className="text-2xl font-bold text-cyber-yellow">#01</span>
                <Trophy className="w-7 h-7 text-cyber-yellow animate-bounce" />
              </div>
              <div className="my-3">
                <h3 className="font-bold text-lg text-cyber-yellow truncate flex items-center gap-1.5">
                  {leaderboard[0].teamName}
                  {leaderboard[0].assignedRoute && (
                    <span className="text-[9px] bg-cyber-yellow/20 text-cyber-yellow border border-cyber-yellow/50 px-1 py-0.2 font-mono">
                      R0{leaderboard[0].assignedRoute}
                    </span>
                  )}
                </h3>
                <div className="text-xs text-gray-300">Lead: {leaderboard[0].teamLead}</div>
              </div>
              <div className="pt-3 border-t border-cyber-yellow/40 flex justify-between text-xs">
                <span className="text-cyber-yellow font-bold text-sm">
                  {leaderboard[0].currentStage > 12 ? '🏆 VICTORY' : `NODE 0${leaderboard[0].currentStage}/12`}
                </span>
                <span className="text-white font-bold text-sm">{formatElapsed(leaderboard[0].startTime, leaderboard[0].completedAt)}</span>
              </div>
            </div>

            {/* Rank 3 */}
            <div className="order-3 bg-cyber-panel border border-amber-600/50 p-4 relative flex flex-col justify-between shadow-md">
              <div className="flex justify-between items-start">
                <span className="text-xl font-bold text-amber-500">#03</span>
                <Medal className="w-6 h-6 text-amber-500" />
              </div>
              <div className="my-3">
                <h3 className="font-bold text-base text-foreground truncate flex items-center gap-1.5">
                  {leaderboard[2].teamName}
                  {leaderboard[2].assignedRoute && (
                    <span className="text-[9px] bg-amber-500/15 text-amber-500 border border-amber-500/40 px-1 py-0.2 font-mono">
                      R0{leaderboard[2].assignedRoute}
                    </span>
                  )}
                </h3>
                <div className="text-xs text-gray-400">Lead: {leaderboard[2].teamLead}</div>
              </div>
              <div className="pt-2 border-t border-cyber-border flex justify-between text-xs">
                <span className="text-cyber-cyan font-bold">
                  {leaderboard[2].currentStage > 12 ? 'VICTORY' : `NODE 0${leaderboard[2].currentStage}/12`}
                </span>
                <span className="text-gray-300 font-bold">{formatElapsed(leaderboard[2].startTime, leaderboard[2].completedAt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Master Ranking Table */}
        <div className="bg-cyber-panel border border-cyber-border overflow-hidden shadow-lg">
          <div className="p-4 border-b border-cyber-border flex justify-between items-center bg-cyber-darker/60">
            <h2 className="text-sm font-bold uppercase tracking-widest text-cyber-yellow flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyber-yellow" />
              Standings ({leaderboard.length} Teams)
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="w-3.5 h-3.5 text-cyber-cyan" />
              <span>Ranked by progress & time</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-cyber-darker text-gray-400 uppercase tracking-wider border-b border-cyber-border">
                <tr>
                  <th className="p-4 w-16 text-center">Rank</th>
                  <th className="p-4">Team Name</th>
                  <th className="p-4">Team Lead</th>
                  <th className="p-4">Progress Bar</th>
                  <th className="p-4 text-center">Current Stage</th>
                  <th className="p-4 text-right">Elapsed Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cyber-border/40">
                {leaderboard.map((team, idx) => {
                  const rank = idx + 1;
                  const progressPercent = Math.min(100, Math.round(((team.currentStage - 1) / 12) * 100));
                  const isWinner = team.currentStage > 12;

                  return (
                    <tr 
                      key={team.id} 
                      className={`hover:bg-cyber-darker/80 transition-colors ${
                        rank === 1 ? 'bg-cyber-yellow/5' : ''
                      }`}
                    >
                      <td className="p-4 text-center font-bold text-sm">
                        {rank === 1 ? (
                          <span className="text-cyber-yellow font-bold flex items-center justify-center gap-1">
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

                      <td className="p-4 font-bold text-sm text-foreground">
                        <div className="flex items-center gap-2">
                          <span className={rank === 1 ? 'text-cyber-yellow' : ''}>{team.teamName}</span>
                          {team.assignedRoute && (
                            <span className="text-[9px] bg-cyber-blue/15 text-cyber-blue border border-cyber-blue/40 px-1 py-0.2 font-mono">
                              R0{team.assignedRoute}
                            </span>
                          )}
                          {isWinner && (
                            <span className="text-[9px] bg-green-500/20 text-green-400 border border-green-500/50 px-1.5 py-0.2 font-bold uppercase">
                              VICTOR
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-4 text-gray-300">{team.teamLead}</td>

                      <td className="p-4 w-48">
                        <div className="w-full bg-cyber-darker h-2 rounded-full overflow-hidden border border-cyber-border/80">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              isWinner ? 'bg-green-400' : 'bg-gradient-to-r from-cyber-cyan to-cyber-yellow'
                            }`}
                            style={{ width: `${isWinner ? 100 : progressPercent}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          {isWinner ? '12/12 Cleared' : `${team.currentStage - 1}/12 Cleared`}
                        </div>
                      </td>

                      <td className="p-4 text-center font-bold">
                        {isWinner ? (
                          <span className="text-green-400 flex items-center justify-center gap-1">
                            <ShieldCheck className="w-4 h-4" />
                            COMPLETED
                          </span>
                        ) : (
                          <span className="text-cyber-cyan">NODE 0{team.currentStage}</span>
                        )}
                      </td>

                      <td className="p-4 text-right font-bold text-cyber-yellow text-sm">
                        {formatElapsed(team.startTime, team.completedAt)}
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
