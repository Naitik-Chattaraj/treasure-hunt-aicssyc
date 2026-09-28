'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Terminal, Lock, AlertCircle, ShieldCheck } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [teamLead, setTeamLead] = useState('');
  const [uid, setUid] = useState('');
  
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getProfile().then(profile => {
      if (profile) router.push('/hunt');
    });
  }, [router]);

  const validateField = (name: string, value: string): string => {
    const trimmed = value.trim();
    if (name === 'teamName') {
      if (!trimmed) return 'Team Name is required.';
      if (trimmed.length < 3) return 'Team Name must be at least 3 characters.';
      if (trimmed.length > 35) return 'Team Name cannot exceed 35 characters.';
    }
    if (name === 'teamLead') {
      if (!trimmed) return 'Team Lead Name is required.';
      if (trimmed.length < 2) return 'Team Lead Name must be at least 2 characters.';
      if (!/^[a-zA-Z\s.'-]+$/.test(trimmed)) return 'Only letters, spaces, and hyphens allowed.';
    }
    if (name === 'uid') {
      if (!trimmed) return 'Unique Identification ID is required.';
      if (trimmed.length < 4) return 'UID must be at least 4 characters.';
      if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return 'UID must be alphanumeric (e.g. AICSSYC-2026-XXXX).';
    }
    return '';
  };

  const handleChange = (field: 'teamName' | 'teamLead' | 'uid', value: string) => {
    if (field === 'teamName') setTeamName(value);
    if (field === 'teamLead') setTeamLead(value);
    if (field === 'uid') setUid(value);

    if (touched[field]) {
      const err = validateField(field, value);
      setFieldErrors(prev => ({ ...prev, [field]: err }));
    }
    if (authError) setAuthError('');
  };

  const handleBlur = (field: 'teamName' | 'teamLead' | 'uid') => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const val = field === 'teamName' ? teamName : field === 'teamLead' ? teamLead : uid;
    const err = validateField(field, val);
    setFieldErrors(prev => ({ ...prev, [field]: err }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Mark all as touched and run full validation
    const errTeam = validateField('teamName', teamName);
    const errLead = validateField('teamLead', teamLead);
    const errUid = validateField('uid', uid);

    setTouched({ teamName: true, teamLead: true, uid: true });
    setFieldErrors({
      teamName: errTeam,
      teamLead: errLead,
      uid: errUid,
    });

    if (errTeam || errLead || errUid) {
      setAuthError('PLEASE RESOLVE VALIDATION ERRORS BEFORE PROCEEDING.');
      return;
    }

    setLoading(true);
    setAuthError('');

    try {
      const profile = await api.login(uid.trim(), teamName.trim(), teamLead.trim());
      if (profile) {
        router.push('/hunt');
      } else {
        setAuthError('ACCESS DENIED: INVALID OR UNREGISTERED CREDENTIALS.');
        setLoading(false);
      }
    } catch {
      setAuthError('CONNECTION ERROR: UNABLE TO REACH AUTHENTICATION SERVICE.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-cyber-dark text-foreground flex items-center justify-center p-4 relative overflow-hidden transition-colors">
      <div className="overlay-scanlines"></div>
      
      {/* Top Controls Bar */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="z-10 w-full max-w-md bg-cyber-panel cyber-panel-border border-t-2 border-b-2 border-cyber-cyan p-6 sm:p-8 shadow-[0_0_20px_rgba(0,240,255,0.15)] transition-all">
        <div className="flex justify-center mb-5">
          <Terminal className="w-12 h-12 text-cyber-cyan animate-pulse" />
        </div>
        
        <h1 className="text-2xl sm:text-3xl text-center font-bold mb-2 tracking-widest cyber-glitch-text text-cyber-cyan uppercase font-mono">
          TREASURE HUNT 2026
        </h1>
        <p className="text-center text-xs tracking-widest text-cyber-muted mb-8 font-mono">
          AICSSYC // PARTICIPANT ACCESS TERMINAL
        </p>

        {authError && (
          <div className="bg-cyber-pink/15 border border-cyber-pink text-cyber-pink px-4 py-2.5 mb-6 font-mono text-xs uppercase flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5 font-mono" noValidate>
          {/* Team Name */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs uppercase text-cyber-cyan font-bold tracking-wider">
                Team Name
              </label>
              {touched.teamName && !fieldErrors.teamName && teamName.trim() && (
                <span className="text-[10px] text-green-500 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> VALID
                </span>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. CYBER_PUNKS_01"
              value={teamName}
              onChange={e => handleChange('teamName', e.target.value)}
              onBlur={() => handleBlur('teamName')}
              className={`w-full bg-cyber-darker border ${
                fieldErrors.teamName ? 'border-cyber-pink focus:border-cyber-pink' : 'border-cyber-border focus:border-cyber-cyan'
              } text-foreground px-4 py-3 outline-none text-sm focus:shadow-[0_0_10px_rgba(0,240,255,0.25)] transition-all placeholder:text-gray-500`}
            />
            {touched.teamName && fieldErrors.teamName && (
              <p className="text-[11px] text-cyber-pink mt-1 flex items-center gap-1 font-mono">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {fieldErrors.teamName}
              </p>
            )}
          </div>

          {/* Team Lead */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs uppercase text-cyber-cyan font-bold tracking-wider">
                Team Lead Name
              </label>
              {touched.teamLead && !fieldErrors.teamLead && teamLead.trim() && (
                <span className="text-[10px] text-green-500 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> VALID
                </span>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. Alex Mercer"
              value={teamLead}
              onChange={e => handleChange('teamLead', e.target.value)}
              onBlur={() => handleBlur('teamLead')}
              className={`w-full bg-cyber-darker border ${
                fieldErrors.teamLead ? 'border-cyber-pink focus:border-cyber-pink' : 'border-cyber-border focus:border-cyber-cyan'
              } text-foreground px-4 py-3 outline-none text-sm focus:shadow-[0_0_10px_rgba(0,240,255,0.25)] transition-all placeholder:text-gray-500`}
            />
            {touched.teamLead && fieldErrors.teamLead && (
              <p className="text-[11px] text-cyber-pink mt-1 flex items-center gap-1 font-mono">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {fieldErrors.teamLead}
              </p>
            )}
          </div>

          {/* Unique Identification ID (UID) */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs uppercase text-cyber-cyan font-bold tracking-wider">
                Unique Identification ID (UID)
              </label>
              {touched.uid && !fieldErrors.uid && uid.trim() && (
                <span className="text-[10px] text-green-500 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> VALID
                </span>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. AICSSYC-2026-9041"
              value={uid}
              onChange={e => handleChange('uid', e.target.value)}
              onBlur={() => handleBlur('uid')}
              className={`w-full bg-cyber-darker border ${
                fieldErrors.uid ? 'border-cyber-pink focus:border-cyber-pink' : 'border-cyber-border focus:border-cyber-cyan'
              } text-foreground px-4 py-3 outline-none text-sm focus:shadow-[0_0_10px_rgba(0,240,255,0.25)] transition-all placeholder:text-gray-500`}
            />
            {touched.uid && fieldErrors.uid && (
              <p className="text-[11px] text-cyber-pink mt-1 flex items-center gap-1 font-mono">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {fieldErrors.uid}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full cyber-button-border bg-cyber-cyan hover:bg-cyber-blue text-cyber-dark font-bold text-base py-3.5 uppercase tracking-widest transition-all mt-4 disabled:opacity-50 cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.2)]"
          >
            {loading ? 'AUTHENTICATING...' : 'INITIALIZE LINK'}
          </button>
        </form>
      </div>
    </main>
  );
}
