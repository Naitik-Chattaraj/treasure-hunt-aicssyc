'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { 
  Terminal, 
  Lock, 
  AlertCircle, 
  ShieldCheck, 
  Clock, 
  RefreshCw, 
  ShieldAlert, 
  Users, 
  Plus, 
  Trash2, 
  BrainCircuit, 
  Footprints,
  UserCheck,
  LogIn,
  UserPlus,
  Zap
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { TeamMember } from '@/types/hunt';

export default function LoginPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [teamLead, setTeamLead] = useState('');
  const [uid, setUid] = useState(''); // 6-digit code
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [operativeName, setOperativeName] = useState('');
  const [operativeRole, setOperativeRole] = useState<'Base Decoder' | 'Field Scout'>('Base Decoder');
  
  // 4 to 5 members
  const [members, setMembers] = useState<TeamMember[]>([
    { name: '', role: 'Base Decoder', regNo: '', phone: '' },
    { name: '', role: 'Base Decoder', regNo: '', phone: '' },
    { name: '', role: 'Field Scout', regNo: '', phone: '' },
    { name: '', role: 'Field Scout', regNo: '', phone: '' },
  ]);
  const [showMembers, setShowMembers] = useState(false);

  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    api.getProfile().then(profile => {
      if (profile && profile.status === 'approved') {
        router.push('/hunt');
      } else if (profile && profile.status === 'pending') {
        setPendingApproval(true);
      }
    });
  }, [router]);

  // Keep member[0] synchronized with team lead name
  useEffect(() => {
    if (!isLoginMode && teamLead) {
      setMembers(prev => {
        const next = [...prev];
        next[0] = { ...next[0], name: teamLead };
        return next;
      });
      if (!operativeName) {
        setOperativeName(teamLead);
      }
    }
  }, [teamLead, isLoginMode, operativeName]);

  // Auto-poll when pending approval (8s interval, paused when tab is hidden)
  useEffect(() => {
    if (!pendingApproval) return;

    let interval: NodeJS.Timeout | null = null;

    const checkApproval = async () => {
      // Poll in login mode with the access code issued at registration
      const res = await api.login(uid.trim(), teamName.trim(), teamLead.trim(), members, true, operativeName.trim(), operativeRole);
      if (res.status === 'approved') {
        router.push('/hunt');
      }
    };

    const startPolling = () => {
      if (!interval) {
        interval = setInterval(() => {
          if (document.visibilityState === 'visible') {
            checkApproval();
          }
        }, 8000);
      }
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkApproval();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pendingApproval, uid, teamName, teamLead, members, operativeName, operativeRole, router]);

  const validateField = (name: string, value: string): string => {
    const trimmed = value.trim();
    if (name === 'teamName') {
      if (!trimmed) return 'Team Name is required.';
      if (trimmed.length < 3) return 'Team Name must be at least 3 characters.';
      if (trimmed.length > 35) return 'Team Name cannot exceed 35 characters.';
    }
    if (name === 'teamLead' && !isLoginMode) {
      if (!trimmed) return 'Team Lead Name is required.';
      if (trimmed.length < 2) return 'Team Lead Name must be at least 2 characters.';
      if (!/^[a-zA-Z\s.'-]+$/.test(trimmed)) return 'Only letters, spaces, and hyphens allowed.';
    }
    if (name === 'uid' && isLoginMode) {
      if (!trimmed) return '6-Digit Access Code is required.';
      if (trimmed.length !== 6) return 'Access Code must be exactly 6 characters.';
      if (!/^[A-Za-z0-9]+$/.test(trimmed)) return 'Access Code must be alphanumeric.';
    }
    if (name === 'operativeName' && isLoginMode) {
      if (!trimmed) return 'Operative Name is required.';
      if (trimmed.length < 2) return 'Operative Name must be at least 2 characters.';
    }
    return '';
  };

  const handleChange = (field: 'teamName' | 'teamLead' | 'uid' | 'operativeName', value: string) => {
    if (field === 'teamName') setTeamName(value);
    if (field === 'teamLead') setTeamLead(value);
    if (field === 'uid') setUid(value);
    if (field === 'operativeName') setOperativeName(value);

    if (touched[field]) {
      const err = validateField(field, value);
      setFieldErrors(prev => ({ ...prev, [field]: err }));
    }
    if (authError) setAuthError('');
  };

  const handleBlur = (field: 'teamName' | 'teamLead' | 'uid' | 'operativeName') => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const val = field === 'teamName' ? teamName : field === 'teamLead' ? teamLead : field === 'uid' ? uid : operativeName;
    const err = validateField(field, val);
    setFieldErrors(prev => ({ ...prev, [field]: err }));
  };

  const handleAddMember = () => {
    if (members.length >= 5) return;
    setMembers(prev => [
      ...prev,
      { name: '', role: 'Field Scout', regNo: `REG-00${prev.length + 1}`, phone: '' }
    ]);
  };

  const handleRemoveMember = (idx: number) => {
    if (members.length <= 4) return;
    setMembers(prev => prev.filter((_, i) => i !== idx));
  };

  const handleManualCheck = async () => {
    setCheckingStatus(true);
    try {
      const res = await api.login(uid.trim(), teamName.trim(), teamLead.trim(), members, true, operativeName.trim(), operativeRole);
      if (res.status === 'approved') {
        router.push('/hunt');
      } else if (res.status === 'rejected') {
        setPendingApproval(false);
        setAuthError('AUTHORIZATION DENIED.');
      }
    } catch {
      // keep waiting
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const errTeam = validateField('teamName', teamName);
    const errLead = validateField('teamLead', teamLead);
    const errUid = validateField('uid', uid);
    const errOperative = validateField('operativeName', operativeName);

    setTouched({ teamName: true, teamLead: true, uid: true, operativeName: true });
    setFieldErrors({
      teamName: errTeam,
      teamLead: errLead,
      uid: errUid,
      operativeName: errOperative,
    });

    if (!isLoginMode && (errTeam || errLead)) {
      setAuthError('PLEASE RESOLVE VALIDATION ERRORS.');
      return;
    }
    if (isLoginMode && (errTeam || errUid || errOperative)) {
      setAuthError('PLEASE COMPLETE ALL REQUIRED FIELDS.');
      return;
    }

    if (!isLoginMode) {
      if (members.length < 4 || members.length > 5) {
        setAuthError('TEAMS MUST HAVE 4 OR 5 MEMBERS.');
        return;
      }
      for (const m of members) {
        if (!m.regNo.trim() || !m.phone.trim()) {
           setAuthError('ALL MEMBERS MUST PROVIDE REG NO AND PHONE.');
           return;
        }
      }
    }

    setLoading(true);
    setAuthError('');

    // Ensure member names are filled if empty
    const finalMembers = members.map((m, i) => ({
      name: m.name.trim() || (i === 0 ? teamLead.trim() : `Member ${i + 1}`),
      role: m.role,
      regNo: m.regNo.trim(),
      phone: m.phone.trim(),
    }));

    const finalOperativeName = isLoginMode 
      ? operativeName.trim() 
      : (operativeName.trim() || teamLead.trim());

    try {
      const res = await api.login(
        uid.trim(), 
        teamName.trim(), 
        teamLead.trim(), 
        finalMembers, 
        isLoginMode,
        finalOperativeName,
        operativeRole
      );
      
      if (res.status === 'approved') {
        router.push('/hunt');
      } else if (res.status === 'pending') {
        // Keep the access code from registration so the approval poll can log in with it
        if (res.team?.uid) setUid(res.team.uid);
        setPendingApproval(true);
      } else {
        setAuthError(res.error || 'ACCESS DENIED: REGISTRATION REJECTED.');
      }
    } catch {
      setAuthError('CONNECTION ERROR: UNABLE TO REACH SERVER.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas text-ink flex items-center justify-center p-4 relative overflow-hidden transition-colors">
      
      {/* Top Controls Bar */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="z-10 w-full max-w-md bg-surface rounded-xl border-t-2 border-b-2 border-accent p-6 sm:p-8 shadow-[0_0_20px_rgba(0,240,255,0.15)] transition-all">
        <div className="flex justify-center mb-4">
          <Terminal className="w-12 h-12 text-accent animate-pulse" />
        </div>
        
        <h1 className="text-2xl sm:text-3xl text-center font-bold mb-1 tracking-widest text-accent uppercase font-mono">
          TREASURE HUNT 2026
        </h1>
        <p className="text-center text-xs tracking-widest text-muted mb-4 font-mono">
          AICSSYC // PARTICIPANT LOGIN
        </p>

        {/* 4-5 Members Role Banner */}
        <div className="bg-sunken border border-accent/20 p-3 mb-6 text-center text-[12px] font-mono text-gray-300 rounded">
          <span className="text-primary font-bold">TEAM FORMATION (4-5 MEMBERS):</span>
          <div className="text-[11px] text-muted mt-1">
            2 Base Decoders + 2-3 Field Scouts
          </div>
        </div>

        {authError && (
          <div className="bg-danger/15 border border-danger text-danger px-4 py-2.5 mb-6 font-mono text-xs uppercase flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        {pendingApproval ? (
          <div className="space-y-6 text-center font-mono">
            <div className="p-5 bg-sunken border border-primary/60 text-primary relative">
              <Clock className="w-10 h-10 mx-auto mb-3 animate-spin text-primary" style={{ animationDuration: '6s' }} />
              <h2 className="text-sm font-bold tracking-widest uppercase mb-1">
                APPROVAL PENDING
              </h2>
              <p className="text-xs text-gray-300 leading-relaxed mt-2">
                Team <span className="text-primary font-bold">{teamName}</span> is pending approval.
              </p>
              <p className="text-[11px] text-gray-400 mt-2">
                An organizer will approve your team and provide a <strong className="text-accent">6-digit access code</strong> for login.
              </p>
            </div>

            <button
              onClick={handleManualCheck}
              disabled={checkingStatus}
              className="w-full rounded-lg bg-primary hover:bg-yellow-400 text-on-primary font-bold text-sm py-3 uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`} />
              {checkingStatus ? 'Checking...' : 'CHECK STATUS NOW'}
            </button>

            <button
              onClick={() => {
                setPendingApproval(false);
                setIsLoginMode(true);
              }}
              className="text-xs text-gray-400 hover:text-accent transition-colors underline cursor-pointer"
            >
              Back to login (I have my access code)
            </button>
          </div>
        ) : (
          <>
            <div className="flex w-full mb-8 border-b border-line">
              <button
                type="button"
                className={`flex-1 py-3 text-sm font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2 ${!isLoginMode ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-white'}`}
                onClick={() => { setIsLoginMode(false); setAuthError(''); }}
              >
                <UserPlus className="w-4 h-4" />
                REGISTER
              </button>
              <button
                type="button"
                className={`flex-1 py-3 text-sm font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2 ${isLoginMode ? 'text-accent border-b-2 border-accent' : 'text-muted hover:text-white'}`}
                onClick={() => { setIsLoginMode(true); setAuthError(''); }}
              >
                <LogIn className="w-4 h-4" />
                LOGIN
              </button>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-6 font-mono" noValidate>
              {/* Team Name */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs uppercase text-accent font-bold tracking-wider">
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
                  placeholder="e.g. BinaryBrains"
                  value={teamName}
                  onChange={e => handleChange('teamName', e.target.value)}
                  onBlur={() => handleBlur('teamName')}
                  className={`w-full bg-sunken border ${
                    fieldErrors.teamName ? 'border-danger focus:border-danger' : 'border-line focus:border-accent'
                  } text-ink px-4 py-2.5 outline-none text-sm focus:shadow-[0_0_10px_rgba(0,240,255,0.25)] transition-all placeholder:text-gray-500`}
                />
                {touched.teamName && fieldErrors.teamName && (
                  <p className="text-[11px] text-danger mt-1 flex items-center gap-1 font-mono">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {fieldErrors.teamName}
                  </p>
                )}
              </div>

            {/* Team Lead */}
            {!isLoginMode && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs uppercase text-accent font-bold tracking-wider">
                    Team Lead (Base Decoder)
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
                  className={`w-full bg-sunken border ${
                    fieldErrors.teamLead ? 'border-danger focus:border-danger' : 'border-line focus:border-accent'
                  } text-ink px-4 py-2.5 outline-none text-sm focus:shadow-[0_0_10px_rgba(0,240,255,0.25)] transition-all placeholder:text-gray-500`}
                />
                {touched.teamLead && fieldErrors.teamLead && (
                  <p className="text-[11px] text-danger mt-1 flex items-center gap-1 font-mono">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {fieldErrors.teamLead}
                  </p>
                )}
              </div>
            )}

            {/* Unique Identification ID (UID) */}
            {isLoginMode && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs uppercase text-accent font-bold tracking-wider">
                    6-Digit Access Code
                  </label>
                  {touched.uid && !fieldErrors.uid && uid.trim() && (
                    <span className="text-[10px] text-green-500 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> VALID
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="e.g. A1B2C3"
                  value={uid}
                  onChange={e => handleChange('uid', e.target.value.toUpperCase())}
                  onBlur={() => handleBlur('uid')}
                  className={`w-full bg-sunken border ${
                    fieldErrors.uid ? 'border-danger focus:border-danger' : 'border-line focus:border-accent'
                  } text-ink px-4 py-2.5 outline-none text-sm focus:shadow-[0_0_10px_rgba(0,240,255,0.25)] transition-all placeholder:text-gray-500 uppercase`}
                />
                {touched.uid && fieldErrors.uid && (
                  <p className="text-[11px] text-danger mt-1 flex items-center gap-1 font-mono">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {fieldErrors.uid}
                  </p>
                )}
              </div>
            )}

            {/* Operative Name & Role Assignment on this Device */}
            {isLoginMode && (
              <div className="space-y-3 pt-1 border-t border-line/60">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs uppercase text-accent font-bold tracking-wider">
                      Team Leader's Name
                    </label>
                    {touched.operativeName && !fieldErrors.operativeName && operativeName.trim() && (
                      <span className="text-[10px] text-green-500 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> VALID
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Alex Mercer"
                    value={operativeName}
                    onChange={e => handleChange('operativeName', e.target.value)}
                    onBlur={() => handleBlur('operativeName')}
                    className={`w-full bg-sunken border ${
                      fieldErrors.operativeName ? 'border-danger focus:border-danger' : 'border-line focus:border-accent'
                    } text-ink px-4 py-2.5 outline-none text-sm focus:shadow-[0_0_10px_rgba(0,240,255,0.25)] transition-all placeholder:text-gray-500`}
                  />
                  {touched.operativeName && fieldErrors.operativeName && (
                    <p className="text-[11px] text-danger mt-1 flex items-center gap-1 font-mono">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {fieldErrors.operativeName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs uppercase text-accent font-bold tracking-wider mb-2">
                    Your Role
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setOperativeRole('Base Decoder')}
                      className={`p-3.5 border rounded-sm text-left flex flex-col justify-between transition-all cursor-pointer ${
                        operativeRole === 'Base Decoder'
                          ? 'bg-accent/15 border-accent shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                          : 'bg-sunken border-line text-gray-400 hover:border-accent/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <BrainCircuit className={`w-5 h-5 ${operativeRole === 'Base Decoder' ? 'text-accent' : 'text-gray-400'}`} />
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm border ${
                          operativeRole === 'Base Decoder' ? 'bg-accent text-on-primary border-accent' : 'border-gray-700 text-gray-500'
                        }`}>
                          Room
                        </span>
                      </div>
                      <div>
                        <div className={`text-sm font-bold ${operativeRole === 'Base Decoder' ? 'text-accent' : 'text-ink'}`}>
                          Base Decoder
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 leading-tight">
                          Solves questions in room
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOperativeRole('Field Scout')}
                      className={`p-3.5 border rounded-sm text-left flex flex-col justify-between transition-all cursor-pointer ${
                        operativeRole === 'Field Scout'
                          ? 'bg-primary/15 border-primary shadow-[0_0_12px_rgba(252,238,10,0.25)]'
                          : 'bg-sunken border-line text-gray-400 hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Footprints className={`w-5 h-5 ${operativeRole === 'Field Scout' ? 'text-primary' : 'text-gray-400'}`} />
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm border ${
                          operativeRole === 'Field Scout' ? 'bg-primary text-on-primary border-primary' : 'border-gray-700 text-gray-500'
                        }`}>
                          Campus
                        </span>
                      </div>
                      <div>
                        <div className={`text-sm font-bold ${operativeRole === 'Field Scout' ? 'text-primary' : 'text-ink'}`}>
                          Field Scout
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 leading-tight">
                          Scans QR codes on field
                        </div>
                      </div>
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                    Limit: 1 active device per role (1 Field Scout + 1 Base Decoder per team). Logging in on another device will disconnect the previous device for that role.
                  </p>
                </div>
              </div>
            )}

            {/* Operatives Roster Collapsible for Registration */}
            {!isLoginMode && (
              <div className="pt-1 space-y-4">
                <button
                  type="button"
                  onClick={() => setShowMembers(!showMembers)}
                  className="w-full flex items-center justify-between text-xs text-accent bg-sunken border border-line p-3.5 rounded-sm hover:border-accent transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-bold uppercase tracking-wider">
                    <Users className="w-4 h-4 text-primary" />
                    Team Members ({members.length})
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {showMembers ? 'COLLAPSE ▲' : 'CONFIGURE ▼'}
                  </span>
                </button>

                {showMembers && (
                  <div className="p-4 bg-sunken border border-line/70 space-y-4 text-xs rounded-sm">
                    <p className="text-[11px] text-gray-400 mb-2">
                      4-5 members required
                    </p>
                    {members.map((m, idx) => (
                      <div key={idx} className="flex flex-col gap-2 items-start border-b border-line/50 pb-3 mb-2">
                        <div className="flex w-full gap-2 items-center">
                          <span className="text-[10px] text-accent font-bold w-4">{idx + 1}.</span>
                          <input
                            type="text"
                            placeholder={`Member ${idx + 1}`}
                            value={m.name}
                            onChange={e => {
                              const val = e.target.value;
                              setMembers(prev => prev.map((item, i) => i === idx ? { ...item, name: val } : item));
                            }}
                            className="flex-1 bg-surface border border-line px-2 py-1.5 text-ink text-xs outline-none focus:border-accent"
                          />
                          <select
                            value={m.role}
                            onChange={e => {
                              const val = e.target.value;
                              setMembers(prev => prev.map((item, i) => i === idx ? { ...item, role: val } : item));
                            }}
                            className="bg-surface border border-line px-2 py-1.5 text-[11px] text-primary outline-none"
                          >
                            <option value="Base Decoder">Base Decoder</option>
                            <option value="Field Scout">Field Scout</option>
                          </select>
                          {members.length > 4 && idx >= 4 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(idx)}
                              className="text-danger hover:text-white p-1 ml-auto cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex w-full gap-2 pl-6">
                          <input
                            type="text"
                            placeholder="Reg No (e.g. IEEE/College)"
                            value={m.regNo}
                            onChange={e => {
                              const val = e.target.value;
                              setMembers(prev => prev.map((item, i) => i === idx ? { ...item, regNo: val } : item));
                            }}
                            className="flex-1 bg-surface border border-line px-2 py-1.5 text-ink text-xs outline-none focus:border-accent placeholder-gray-500"
                          />
                          <input
                            type="text"
                            placeholder="Phone No."
                            value={m.phone}
                            onChange={e => {
                              const val = e.target.value;
                              setMembers(prev => prev.map((item, i) => i === idx ? { ...item, phone: val } : item));
                            }}
                            className="flex-1 bg-surface border border-line px-2 py-1.5 text-ink text-xs outline-none focus:border-accent placeholder-gray-500"
                          />
                        </div>
                      </div>
                    ))}

                    {members.length < 5 && (
                      <button
                        type="button"
                        onClick={handleAddMember}
                        className="w-full border border-dashed border-primary/60 text-primary hover:bg-primary/10 py-1.5 text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer mt-1"
                      >
                        <Plus className="w-3 h-3" /> Add 5th Member
                      </button>
                    )}
                  </div>
                )}

                {/* Device active role for registration */}
                <div className="p-3 bg-sunken border border-line">
                  <label className="block text-[11px] uppercase text-accent font-bold tracking-wider mb-2 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-primary" />
                    This Device Role:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOperativeRole('Base Decoder');
                        setOperativeName(teamLead || 'Team Lead');
                      }}
                      className={`px-3 py-2 border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        operativeRole === 'Base Decoder'
                          ? 'bg-accent text-on-primary border-accent shadow-[0_0_10px_rgba(0,240,255,0.3)] font-extrabold'
                          : 'bg-surface border-line text-gray-400 hover:border-accent'
                      }`}
                    >
                      <BrainCircuit className="w-3.5 h-3.5" />
                      Base Decoder
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setOperativeRole('Field Scout');
                        setOperativeName(members[2]?.name || 'Field Scout');
                      }}
                      className={`px-3 py-2 border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        operativeRole === 'Field Scout'
                          ? 'bg-primary text-on-primary border-primary shadow-[0_0_10px_rgba(252,238,10,0.3)] font-extrabold'
                          : 'bg-surface border-line text-gray-400 hover:border-primary'
                      }`}
                    >
                      <Footprints className="w-3.5 h-3.5" />
                      Field Scout
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent hover:bg-accent text-on-primary font-bold text-base py-4 uppercase tracking-widest transition-all mt-6 disabled:opacity-50 cursor-pointer shadow-[0_0_12px_rgba(0,240,255,0.2)] flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5" />
              {loading ? 'TRANSMITTING CREDENTIALS...' : 'INITIALIZE LINK'}
            </button>
          </form>
          </>
        )}

        <div className="mt-6 pt-4 border-t border-line/40 text-center">
          <Link
            href="/admin/login"
            className="text-[11px] text-gray-500 hover:text-danger transition-colors font-mono tracking-wider flex items-center justify-center gap-1.5"
          >
            <ShieldAlert className="w-3 h-3" />
            Staff / Admin Login
          </Link>
        </div>
      </div>
    </main>
  );
}
