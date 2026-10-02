'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Footprints,
  Hourglass,
  LogIn,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import TreasureChest from '@/components/TreasureChest';
import { TeamMember } from '@/types/hunt';
import { normalizeName, validateMembers, validatePersonName } from '@/lib/validation';

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
      return validatePersonName(value, 'Team Lead Name');
    }
    if (name === 'uid' && isLoginMode) {
      if (!trimmed) return '6-Digit Access Code is required.';
      if (trimmed.length !== 6) return 'Access Code must be exactly 6 characters.';
      if (!/^[A-Za-z0-9]+$/.test(trimmed)) return 'Access Code must be alphanumeric.';
    }
    if (name === 'operativeName' && isLoginMode) {
      return validatePersonName(value, "Team Leader's Name");
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
      { name: '', role: 'Field Scout', regNo: '', phone: '' }
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

    const finalMembers = members.map(m => ({
      name: normalizeName(m.name),
      role: m.role,
      regNo: m.regNo.trim().toUpperCase(),
      phone: m.phone.trim(),
    }));

    if (!isLoginMode) {
      const membersError = validateMembers(finalMembers);
      if (membersError) {
        setShowMembers(true);
        setAuthError(membersError);
        return;
      }
    }

    setLoading(true);
    setAuthError('');

    const finalOperativeName = isLoginMode 
      ? operativeName.trim() 
      : (operativeName.trim() || teamLead.trim());

    try {
      const res = await api.login(
        uid.trim(), 
        teamName.trim(), 
        isLoginMode ? operativeName.trim() : normalizeName(teamLead), 
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

  const inputClass = (hasError?: string) =>
    `w-full h-12 rounded-lg bg-sunken border px-4 text-base text-ink placeholder:text-muted outline-none transition-colors focus:border-primary focus:shadow-glow ${
      hasError ? 'border-danger' : 'border-line-strong'
    }`;
  const smallInputClass =
    'w-full h-11 rounded-md bg-surface border border-line-strong px-3 text-base sm:text-sm text-ink placeholder:text-muted outline-none transition-colors focus:border-primary focus:shadow-glow';

  const fieldError = (message?: string) =>
    message ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-danger">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {message}
      </p>
    ) : null;

  const validMark = (show: boolean) =>
    show ? (
      <span className="flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Looks good
      </span>
    ) : null;

  return (
    <main className="bg-map min-h-dvh text-ink flex flex-col items-center justify-center px-4 pt-16 pb-10 sm:py-16">
      <div className="fixed top-3 right-3 z-20 sm:top-4 sm:right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-xl border border-line bg-surface parchment p-5 shadow-raised sm:p-8">
        <header className="mb-6 text-center">
          <TreasureChest className="mx-auto -mt-2 mb-2 h-24 w-28 sm:h-28 sm:w-32" />
          <h1 className="title-treasure text-4xl leading-none sm:text-5xl">
            Treasure
            <span className="block">Hunt 2026</span>
          </h1>
          <p className="mt-3 text-sm text-muted">AICSSYC campus hunt · participant entry</p>
        </header>

        <div className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-sunken p-3 text-sm">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-muted">
            <span className="font-semibold text-ink">Teams of 4–5:</span> 2 Base Decoders in the room and 2–3 Field Scouts on campus.
          </p>
        </div>

        {authError && (
          <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{authError}</span>
          </div>
        )}

        {pendingApproval ? (
          <div className="space-y-4 text-center">
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-5">
              <Hourglass className="mx-auto mb-3 h-9 w-9 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Waiting for approval</h2>
              <p className="mt-2 text-sm text-muted">
                Team <span className="font-semibold text-ink">{teamName}</span> is registered and waiting for an organizer to approve it.
              </p>
              <p className="mt-2 text-sm text-muted">
                This page will continue automatically once you&apos;re approved. Organizers will also give you a{' '}
                <strong className="text-ink">6-digit access code</strong> for your other devices.
              </p>
            </div>

            <button
              onClick={handleManualCheck}
              disabled={checkingStatus}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary btn-treasure font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${checkingStatus ? 'animate-spin' : ''}`} aria-hidden="true" />
              {checkingStatus ? 'Checking…' : 'Check status now'}
            </button>

            <button
              onClick={() => {
                setPendingApproval(false);
                setIsLoginMode(true);
              }}
              className="text-sm text-muted underline underline-offset-4 transition-colors hover:text-ink cursor-pointer"
            >
              I have my access code
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1" role="group" aria-label="Choose register or log in">
              {[
                { login: false, label: 'Register', Icon: UserPlus },
                { login: true, label: 'Log in', Icon: LogIn },
              ].map(({ login, label, Icon }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={isLoginMode === login}
                  onClick={() => { setIsLoginMode(login); setAuthError(''); }}
                  className={`flex h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
                    isLoginMode === login ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleLogin} className="space-y-5" noValidate>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="teamName" className="text-sm font-medium">Team name</label>
                  {validMark(!!(touched.teamName && !fieldErrors.teamName && teamName.trim()))}
                </div>
                <input
                  id="teamName"
                  type="text"
                  autoComplete="organization"
                  placeholder="e.g. BinaryBrains"
                  value={teamName}
                  onChange={e => handleChange('teamName', e.target.value)}
                  onBlur={() => handleBlur('teamName')}
                  aria-invalid={!!fieldErrors.teamName}
                  className={inputClass(fieldErrors.teamName)}
                />
                {touched.teamName && fieldError(fieldErrors.teamName)}
              </div>

              {!isLoginMode && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="teamLead" className="text-sm font-medium">Team lead <span className="text-muted">(Base Decoder)</span></label>
                    {validMark(!!(touched.teamLead && !fieldErrors.teamLead && teamLead.trim()))}
                  </div>
                  <input
                    id="teamLead"
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Alex Mercer"
                    value={teamLead}
                    onChange={e => handleChange('teamLead', e.target.value)}
                    onBlur={() => handleBlur('teamLead')}
                    aria-invalid={!!fieldErrors.teamLead}
                    className={inputClass(fieldErrors.teamLead)}
                  />
                  {touched.teamLead && fieldError(fieldErrors.teamLead)}
                </div>
              )}

              {isLoginMode && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="uid" className="text-sm font-medium">6-digit access code</label>
                    {validMark(!!(touched.uid && !fieldErrors.uid && uid.trim()))}
                  </div>
                  <input
                    id="uid"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="A1B2C3"
                    value={uid}
                    onChange={e => handleChange('uid', e.target.value.toUpperCase())}
                    onBlur={() => handleBlur('uid')}
                    aria-invalid={!!fieldErrors.uid}
                    className={`${inputClass(fieldErrors.uid)} font-mono tracking-[0.3em] uppercase`}
                  />
                  {touched.uid && fieldError(fieldErrors.uid)}
                </div>
              )}

              {isLoginMode && (
                <div className="space-y-5 border-t border-line pt-5">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label htmlFor="operativeName" className="text-sm font-medium">Team leader&apos;s name</label>
                      {validMark(!!(touched.operativeName && !fieldErrors.operativeName && operativeName.trim()))}
                    </div>
                    <input
                      id="operativeName"
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Alex Mercer"
                      value={operativeName}
                      onChange={e => handleChange('operativeName', e.target.value)}
                      onBlur={() => handleBlur('operativeName')}
                      aria-invalid={!!fieldErrors.operativeName}
                      className={inputClass(fieldErrors.operativeName)}
                    />
                    {touched.operativeName && fieldError(fieldErrors.operativeName)}
                  </div>

                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">Your role on this device</legend>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { role: 'Base Decoder' as const, Icon: BrainCircuit, where: 'In the room', what: 'Solves the questions', tone: 'accent' },
                        { role: 'Field Scout' as const, Icon: Footprints, where: 'On campus', what: 'Scans the QR codes', tone: 'primary' },
                      ].map(({ role, Icon, where, what, tone }) => {
                        const selected = operativeRole === role;
                        return (
                          <button
                            key={role}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setOperativeRole(role)}
                            className={`flex min-h-28 flex-col justify-between rounded-lg border p-3.5 text-left transition-colors cursor-pointer ${
                              selected
                                ? tone === 'accent' ? 'border-accent bg-accent/10' : 'border-primary bg-primary/10'
                                : 'border-line-strong bg-sunken hover:border-ink/40'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <Icon className={`h-5 w-5 ${selected ? (tone === 'accent' ? 'text-accent' : 'text-primary') : 'text-muted'}`} aria-hidden="true" />
                              <span className="text-xs text-muted">{where}</span>
                            </div>
                            <div>
                              <div className="font-semibold">{role}</div>
                              <div className="mt-0.5 text-xs text-muted">{what}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Up to 2 Base Decoder and 3 Field Scout devices can be signed in at once. Logging in on another device signs out the oldest one for that role.
                    </p>
                  </fieldset>
                </div>
              )}

              {!isLoginMode && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setShowMembers(!showMembers)}
                    aria-expanded={showMembers}
                    className="flex h-12 w-full items-center justify-between rounded-lg border border-line-strong bg-sunken px-4 text-sm transition-colors hover:border-ink/40 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                      Team members ({members.length})
                    </span>
                    <ChevronDown className={`h-4 w-4 text-muted transition-transform ${showMembers ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>

                  {showMembers && (
                    <div className="space-y-3 rounded-lg border border-line bg-sunken p-3 sm:p-4">
                      <p className="text-xs text-muted">4–5 members required. Every member needs a registration number and phone number.</p>
                      {members.map((m, idx) => (
                        <div key={idx} className="space-y-2 rounded-md border border-line bg-surface p-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{idx + 1}</span>
                            <input
                              type="text"
                              aria-label={`Member ${idx + 1} name`}
                              placeholder={`Member ${idx + 1} name`}
                              value={m.name}
                              onChange={e => {
                                const val = e.target.value;
                                setMembers(prev => prev.map((item, i) => i === idx ? { ...item, name: val } : item));
                              }}
                              className={smallInputClass}
                            />
                            {members.length > 4 && idx >= 4 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(idx)}
                                aria-label={`Remove member ${idx + 1}`}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger/10 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <select
                              aria-label={`Member ${idx + 1} role`}
                              value={m.role}
                              onChange={e => {
                                const val = e.target.value;
                                setMembers(prev => prev.map((item, i) => i === idx ? { ...item, role: val } : item));
                              }}
                              className={smallInputClass}
                            >
                              <option value="Base Decoder">Base Decoder</option>
                              <option value="Field Scout">Field Scout</option>
                            </select>
                            <input
                              type="text"
                              aria-label={`Member ${idx + 1} registration number`}
                              placeholder="Reg. no."
                              value={m.regNo}
                              onChange={e => {
                                const val = e.target.value;
                                setMembers(prev => prev.map((item, i) => i === idx ? { ...item, regNo: val } : item));
                              }}
                              className={smallInputClass}
                            />
                            <input
                              type="tel"
                              inputMode="numeric"
                              maxLength={10}
                              aria-label={`Member ${idx + 1} phone number`}
                              placeholder="Phone"
                              value={m.phone}
                              onChange={e => {
                                const val = e.target.value;
                                setMembers(prev => prev.map((item, i) => i === idx ? { ...item, phone: val } : item));
                              }}
                              className={smallInputClass}
                            />
                          </div>
                        </div>
                      ))}

                      {members.length < 5 && (
                        <button
                          type="button"
                          onClick={handleAddMember}
                          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/60 text-sm font-medium text-primary transition-colors hover:bg-primary/10 cursor-pointer"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" /> Add a 5th member
                        </button>
                      )}
                    </div>
                  )}

                  <fieldset className="rounded-lg border border-line bg-sunken p-3">
                    <legend className="sr-only">This device&apos;s role</legend>
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                      <UserCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                      This device will be used by
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={operativeRole === 'Base Decoder'}
                        onClick={() => {
                          setOperativeRole('Base Decoder');
                          setOperativeName(teamLead || 'Team Lead');
                        }}
                        className={`flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors cursor-pointer ${
                          operativeRole === 'Base Decoder'
                            ? 'border-accent bg-accent text-on-primary'
                            : 'border-line-strong bg-surface text-muted hover:text-ink'
                        }`}
                      >
                        <BrainCircuit className="h-4 w-4" aria-hidden="true" />
                        Base Decoder
                      </button>
                      <button
                        type="button"
                        aria-pressed={operativeRole === 'Field Scout'}
                        onClick={() => {
                          setOperativeRole('Field Scout');
                          setOperativeName(members[2]?.name || 'Field Scout');
                        }}
                        className={`flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition-colors cursor-pointer ${
                          operativeRole === 'Field Scout'
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-line-strong bg-surface text-muted hover:text-ink'
                        }`}
                      >
                        <Footprints className="h-4 w-4" aria-hidden="true" />
                        Field Scout
                      </button>
                    </div>
                  </fieldset>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary btn-treasure text-base font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
              >
                {isLoginMode ? <LogIn className="h-5 w-5" aria-hidden="true" /> : <MapIcon className="h-5 w-5" aria-hidden="true" />}
                {loading ? 'Please wait…' : isLoginMode ? 'Log in' : 'Register team'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
