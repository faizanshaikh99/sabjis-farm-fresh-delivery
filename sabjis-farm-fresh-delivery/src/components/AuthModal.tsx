import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Mail, Lock, Smartphone, X, Eye, EyeOff, Check, CheckCircle2, ArrowLeft, Timer, RefreshCw, Key, Copy, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeJson } from '../utils/apiHelper';

interface AuthModalProps {
  onClose: () => void;
  onLoginSuccess: (user: User, sessionId: string) => void;
  onRegisterSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  onClose,
  onLoginSuccess,
  onRegisterSuccess,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot' | 'change-temp-password'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Register states
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Forgot password flow states (compatibility & legacy OTP fallback)
  const [forgotStep, setForgotStep] = useState<'identifier' | 'otp' | 'reset'>('identifier');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [resetRequestId, setResetRequestId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [receivedOtp, setReceivedOtp] = useState(''); // Shown to user for easier test simulation
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);

  // NEW CUSTOM PASSWORD RESET WORKFLOW STATES
  const [forgotSubTab, setForgotSubTab] = useState<'request' | 'check'>('request');
  const [forgotReason, setForgotReason] = useState('');
  const [checkedRequestStatus, setCheckedRequestStatus] = useState<any | null>(null);

  // NEW MANDATORY CHANGE PASSWORD STATES
  const [tempPasswordUserId, setTempPasswordUserId] = useState<string | null>(null);
  const [tempPasswordUsed, setTempPasswordUsed] = useState<string>('');
  const [enteredNewPassword, setEnteredNewPassword] = useState('');
  const [enteredConfirmNewPassword, setEnteredConfirmNewPassword] = useState('');
  const [showEnteredNewPassword, setShowEnteredNewPassword] = useState(false);

  // OTP Timer handler
  useEffect(() => {
    let interval: any = null;
    if (timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && interval) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [timerSeconds]);

  // Reset error on form changes
  useEffect(() => {
    setErrorMsg(null);
  }, [identifier, password, fullName, regEmail, regPhone, regPassword, regConfirmPassword, forgotIdentifier, otpCode, newPassword, confirmNewPassword, tab, forgotSubTab, forgotReason, enteredNewPassword, enteredConfirmNewPassword]);

  // Login handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMsg('Please enter your email/phone and password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password })
      });
      const data = await safeJson(res, { error: 'Invalid response from server' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Login failed.');
      }

      if (data.mustChangePassword) {
        setTempPasswordUserId(data.userId);
        setTempPasswordUsed(password);
        setTab('change-temp-password');
        setIsLoading(false);
        return;
      }

      if (rememberMe) {
        localStorage.setItem('sabjies_saved_identifier', identifier.trim());
      } else {
        localStorage.removeItem('sabjies_saved_identifier');
      }

      // Save user session
      localStorage.setItem('sabjies_current_user', JSON.stringify(data.user));
      localStorage.setItem('sabjies_session_id', data.sessionId);

      onLoginSuccess(data.user, data.sessionId);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Server error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Pre-fill remembered identifier if present
  useEffect(() => {
    const saved = localStorage.getItem('sabjies_saved_identifier');
    if (saved) {
      setIdentifier(saved);
    }
  }, []);

  // Signup/Register handler
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !regEmail.trim() || !regPhone.trim() || !regPassword) {
      setErrorMsg('Please fill in all registration fields.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Password confirmations do not match.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          email: regEmail.trim().toLowerCase(),
          phone: regPhone.trim(),
          password: regPassword
        })
      });
      const data = await safeJson(res, { error: 'Invalid response from server' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Registration failed.');
      }

      // Auto-login or redirect to sign in
      setIdentifier(regEmail.trim());
      setPassword(regPassword);
      setTab('login');
      setErrorMsg('Registration successful! Please login with your credentials.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Server registration error.');
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot password - step 1: Request OTP
  const handleForgotIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setErrorMsg('Please enter your email or phone number.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() })
      });
      const data = await safeJson(res, { error: 'Failed to initiate recovery.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to initiate recovery.');
      }

      setResetRequestId(data.resetRequestId);
      setReceivedOtp(data.otp);
      setTimerSeconds(data.expiresIn || 300);
      setForgotStep('otp');
    } catch (err: any) {
      setErrorMsg(err.message || 'Recovery failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot password - step 2: Verify OTP
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setErrorMsg('Please enter the OTP verification code.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetRequestId, otp: otpCode.trim() })
      });
      const data = await safeJson(res, { error: 'OTP verification failed.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'OTP verification failed.');
      }

      setForgotStep('reset');
    } catch (err: any) {
      setErrorMsg(err.message || 'Incorrect or expired verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot password - step 3: Set new password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmNewPassword) {
      setErrorMsg('Please enter and confirm your new password.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMsg('New password confirmations do not match.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetRequestId, newPassword })
      });
      const data = await safeJson(res, { error: 'Password reset failed.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Password reset failed.');
      }

      setTab('login');
      setIdentifier(forgotIdentifier);
      setPassword(newPassword);
      setForgotStep('identifier');
      setErrorMsg('Password updated successfully! You can now login with your new password.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  // NEW CUSTOM PASSWORD RESET WORKFLOW SUBMIT HANDLERS
  const handleRequestPasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setErrorMsg('Please enter your registered email address or mobile number.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim(), reason: forgotReason })
      });
      const data = await safeJson(res, { error: 'Failed to submit reset request.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to submit reset request.');
      }
      setErrorMsg(data.message);
      setForgotSubTab('check');
    } catch (err: any) {
      setErrorMsg(err.message || 'Request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckResetStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) {
      setErrorMsg('Please enter your email or mobile number.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    setCheckedRequestStatus(null);
    try {
      const res = await fetch('/api/auth/check-reset-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() })
      });
      const data = await safeJson(res, { error: 'Failed to find password reset request.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to find password reset request.');
      }
      setCheckedRequestStatus(data.request);
    } catch (err: any) {
      setErrorMsg(err.message || 'Check failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeTempPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempPasswordUserId || !tempPasswordUsed || !enteredNewPassword || !enteredConfirmNewPassword) {
      setErrorMsg('Please fill in all password fields.');
      return;
    }
    if (enteredNewPassword.length < 6) {
      setErrorMsg('New password must be at least 6 characters.');
      return;
    }
    if (enteredNewPassword !== enteredConfirmNewPassword) {
      setErrorMsg('Confirm password does not match.');
      return;
    }
    if (enteredNewPassword === tempPasswordUsed) {
      setErrorMsg('New password cannot be the same as the temporary password.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/change-temp-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: tempPasswordUserId,
          tempPassword: tempPasswordUsed,
          newPassword: enteredNewPassword
         })
      });
      const data = await safeJson(res, { error: 'Failed to change temporary password.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to change temporary password.');
      }

      // Successful change + Login!
      localStorage.setItem('sabjies_current_user', JSON.stringify(data.user));
      localStorage.setItem('sabjies_session_id', data.sessionId);
      
      // Trigger confetti
      try {
        import('canvas-confetti').then((conf) => {
          conf.default({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
          });
        });
      } catch (e) {}

      onLoginSuccess(data.user, data.sessionId);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error changing password.');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (timerSeconds > 0) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotIdentifier.trim() })
      });
      const data = await safeJson(res, { error: 'Failed to resend OTP.' });
      if (res.ok && data) {
        setResetRequestId(data.resetRequestId);
        setReceivedOtp(data.otp);
        setTimerSeconds(data.expiresIn || 300);
        setErrorMsg('New verification OTP sent successfully!');
      } else {
        setErrorMsg(data?.error || 'Failed to resend OTP.');
      }
    } catch (e) {
      setErrorMsg('Resend OTP error.');
    } finally {
      setIsLoading(false);
    }
  };

  // Password strength checker helper
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { label: '', color: 'bg-gray-200', width: 'w-0' };
    if (pass.length < 6) return { label: 'Too short', color: 'bg-red-500', width: 'w-1/4' };
    
    let score = 0;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score === 0) return { label: 'Weak', color: 'bg-orange-500', width: 'w-1/2' };
    if (score === 1) return { label: 'Fair', color: 'bg-yellow-500', width: 'w-2/3' };
    return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
  };

  const strength = getPasswordStrength(tab === 'register' ? regPassword : newPassword);

  return (
    <div className="fixed inset-0 z-550 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-[420px] rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl p-6 z-10 overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow">
              <span className="text-base">🥦</span>
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[var(--fg)]">
                {tab === 'login' && 'Sign In to Account'}
                {tab === 'register' && 'Create Your Account'}
                {tab === 'forgot' && 'Account Recovery'}
              </h2>
              <p className="text-[10px] text-[var(--muted-fg)]">Sabjis Farm Fresh Delivery</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-fg)] hover:text-red-500 hover:border-red-200 transition-all bg-[var(--card)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Dynamic Warning / Error Notification */}
        {errorMsg && (
          <div className={`p-3 rounded-xl mb-4 text-xs font-bold leading-relaxed border ${
            errorMsg.includes('successful') || errorMsg.includes('sent') || errorMsg.includes('verified')
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {errorMsg}
          </div>
        )}

        {/* Tab Selection */}
        {tab !== 'forgot' && (
          <div className="flex rounded-full bg-[var(--muted)] border border-[var(--border)] p-1 gap-1 mb-5">
            <button
              onClick={() => setTab('login')}
              className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${
                tab === 'login' ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm' : 'text-[var(--muted-fg)]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setTab('register')}
              className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all ${
                tab === 'register' ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm' : 'text-[var(--muted-fg)]'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {/* Views */}
        <AnimatePresence mode="wait">
          {tab === 'login' && (
            <motion.form
              key="login"
              onSubmit={handleLoginSubmit}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              {/* Email / Mobile */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[var(--muted-fg)]">Email or Mobile Number</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter email or 10-digit mobile number"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] pl-10 pr-4 py-2.5 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] transition-all font-medium"
                  />
                  <Smartphone className="absolute left-3.5 top-3 h-4 w-4 text-[var(--muted-fg)]" />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--muted-fg)]">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('forgot');
                      setForgotStep('identifier');
                    }}
                    className="text-[10px] font-bold text-[var(--primary)] hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] pl-10 pr-10 py-2.5 text-xs text-[var(--fg)] outline-none focus:border-[var(--primary)] transition-all font-medium"
                  />
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[var(--muted-fg)]" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-[var(--muted-fg)] hover:text-[var(--fg)]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me option */}
              <div className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[var(--border)] text-[var(--primary)] accent-[var(--primary)] cursor-pointer"
                />
                <label htmlFor="rememberMe" className="text-[11px] font-semibold text-[var(--muted-fg)] cursor-pointer select-none">
                  Remember my credentials
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[var(--primary)] text-white font-bold rounded-xl py-2.5 text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Secure Login</span>
                )}
              </button>
            </motion.form>
          )}

          {tab === 'register' && (
            <motion.form
              key="register"
              onSubmit={handleRegisterSubmit}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--muted-fg)]">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Rahul Sharma"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-[var(--muted-fg)]">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-[var(--muted-fg)]">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Enter 10-digit mobile number"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--muted-fg)]">Password *</label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] pl-3.5 pr-10 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-3 text-[var(--muted-fg)] hover:text-[var(--fg)]"
                  >
                    {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                
                {/* Strength Meter */}
                {regPassword && (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-bold">
                      <span className="text-[var(--muted-fg)]">Password Strength:</span>
                      <span className="text-[var(--fg)]">{strength.label}</span>
                    </div>
                    <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${strength.color} ${strength.width} transition-all duration-300`} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-[var(--muted-fg)]">Confirm Password *</label>
                <input
                  type="password"
                  required
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[var(--primary)] text-white font-bold rounded-xl py-2.5 text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Create Account</span>}
              </button>
            </motion.form>
          )}

          {tab === 'forgot' && (
            <motion.div
              key="forgot"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              {/* Back button */}
              <button
                onClick={() => {
                  setTab('login');
                  setCheckedRequestStatus(null);
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted-fg)] hover:text-[var(--primary)] mb-2 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Login</span>
              </button>

              {/* Recovery Sub-Tabs */}
              <div className="grid grid-cols-2 gap-1 bg-[var(--input-bg)] p-1 rounded-xl border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => {
                    setForgotSubTab('request');
                    setErrorMsg(null);
                  }}
                  className={`py-1.5 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                    forgotSubTab === 'request'
                      ? 'bg-[var(--primary)] text-white shadow-sm'
                      : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                  }`}
                >
                  Request Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForgotSubTab('check');
                    setErrorMsg(null);
                  }}
                  className={`py-1.5 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                    forgotSubTab === 'check'
                      ? 'bg-[var(--primary)] text-white shadow-sm'
                      : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                  }`}
                >
                  Check Status
                </button>
              </div>

              {/* Sub-Tab 1: Request Password Reset */}
              {forgotSubTab === 'request' && (
                <form onSubmit={handleRequestPasswordResetSubmit} className="space-y-4">
                  <p className="text-[10px] text-[var(--muted-fg)] leading-relaxed">
                    Submit a password reset request. An administrator will review your account and generate a secure temporary password.
                  </p>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--muted-fg)]">Registered Email or Mobile Number *</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-fg)]" />
                      <input
                        type="text"
                        required
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder="Enter registered email or mobile number"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] pl-10 pr-3.5 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-[var(--muted-fg)]">Reason for password reset (Optional)</label>
                    <textarea
                      value={forgotReason}
                      onChange={(e) => setForgotReason(e.target.value)}
                      placeholder="Explain briefly why you need to reset your password..."
                      rows={2}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)] resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[var(--primary)] text-white font-bold rounded-xl py-2.5 text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Submit Reset Request</span>}
                  </button>
                </form>
              )}

              {/* Sub-Tab 2: Check Reset Status */}
              {forgotSubTab === 'check' && (
                <div className="space-y-4">
                  <form onSubmit={handleCheckResetStatusSubmit} className="space-y-3">
                    <p className="text-[10px] text-[var(--muted-fg)] leading-relaxed">
                      Enter your email or phone number to check if your reset request has been approved and get your temporary password.
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[var(--muted-fg)]">Email or Mobile Number</label>
                      <input
                        type="text"
                        required
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder="Enter registered email or mobile number"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-emerald-800 text-white font-bold rounded-xl py-2 text-xs hover:bg-emerald-900 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <span>Check Request Status</span>}
                    </button>
                  </form>

                  {checkedRequestStatus && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl border bg-[var(--bg)] space-y-3"
                      style={{
                        borderColor: checkedRequestStatus.status === 'Approved' ? '#10b981' : checkedRequestStatus.status === 'Pending' ? '#f59e0b' : '#ef4444'
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[var(--muted-fg)]">Request ID: {checkedRequestStatus.id}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wide uppercase ${
                          checkedRequestStatus.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : checkedRequestStatus.status === 'Pending'
                            ? 'bg-amber-100 text-amber-800 animate-pulse'
                            : checkedRequestStatus.status === 'Completed'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {checkedRequestStatus.status}
                        </span>
                      </div>

                      <div className="text-xs space-y-1">
                        <div><span className="font-bold text-[var(--muted-fg)]">Account Holder:</span> <span className="font-medium text-[var(--fg)]">{checkedRequestStatus.name}</span></div>
                        <div><span className="font-bold text-[var(--muted-fg)]">Requested On:</span> <span className="font-mono text-[var(--muted-fg)] text-[10px]">{new Date(checkedRequestStatus.createdAt).toLocaleString()}</span></div>
                      </div>

                      {checkedRequestStatus.status === 'Pending' && (
                        <div className="p-2.5 rounded-xl bg-amber-50/50 border border-amber-200/50 text-[10px] text-amber-800 font-medium leading-relaxed flex gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                          <span>Your request is currently **Pending** review by the administrator. Please check back shortly.</span>
                        </div>
                      )}

                      {checkedRequestStatus.status === 'Rejected' && (
                        <div className="p-2.5 rounded-xl bg-red-50/50 border border-red-200/50 text-[10px] text-red-800 font-medium leading-relaxed">
                          Your password reset request was rejected by the administrator. Please contact customer support.
                        </div>
                      )}

                      {checkedRequestStatus.status === 'Approved' && (
                        <div className="space-y-3 pt-1">
                          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 text-[11px] text-emerald-900 leading-relaxed space-y-2">
                            <strong className="font-black text-emerald-800 block">🔔 Password Reset Approved!</strong>
                            <p>Your password reset request has been approved by the administrator.</p>
                            
                            <div className="mt-2 bg-white rounded-lg border border-emerald-300 p-2.5 flex items-center justify-between gap-2 shadow-sm">
                              <div>
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Your Temporary Password</span>
                                <strong className="text-base font-mono font-black text-gray-900 tracking-wider select-all">{checkedRequestStatus.tempPassword}</strong>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(checkedRequestStatus.tempPassword);
                                  setErrorMsg('Temporary password copied to clipboard!');
                                }}
                                className="p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg transition-all cursor-pointer"
                                title="Copy Password"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </div>

                            <p className="text-[9px] text-emerald-700 font-bold italic mt-2">
                              Please log in using this temporary password and change it immediately.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setIdentifier(forgotIdentifier);
                              setPassword(checkedRequestStatus.tempPassword);
                              setTab('login');
                              setCheckedRequestStatus(null);
                              setErrorMsg('Temporary password filled! Click Login to proceed.');
                            }}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Key className="h-3.5 w-3.5" />
                            <span>Proceed to Login</span>
                          </button>
                        </div>
                      )}

                      {checkedRequestStatus.status === 'Completed' && (
                        <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-[10px] text-indigo-800 leading-relaxed font-medium">
                          This request has already been completed. If you still cannot access your account, please submit a new reset request.
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {tab === 'change-temp-password' && (
            <motion.div
              key="change-temp-password"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="text-xs font-black text-amber-900 block">Mandatory Password Update</strong>
                  <p className="text-[10px] text-amber-800 leading-relaxed">
                    You have logged in using a temporary password. For security reasons, you are required to change your password before continuing.
                  </p>
                </div>
              </div>

              <form onSubmit={handleChangeTempPasswordSubmit} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[var(--muted-fg)]">Temporary Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-fg)]" />
                    <input
                      type="password"
                      required
                      disabled
                      value={tempPasswordUsed}
                      className="w-full rounded-xl border border-[var(--border)] bg-gray-100 px-10 py-2.5 text-xs text-[var(--fg)] font-medium outline-none cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[var(--muted-fg)]">Choose New Strong Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-fg)]" />
                    <input
                      type={showEnteredNewPassword ? 'text' : 'password'}
                      required
                      value={enteredNewPassword}
                      onChange={(e) => setEnteredNewPassword(e.target.value)}
                      placeholder="Choose a secure password"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-10 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEnteredNewPassword(!showEnteredNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-fg)] hover:text-[var(--fg)] cursor-pointer"
                    >
                      {showEnteredNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  {enteredNewPassword && (
                    <div className="mt-1 space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-bold">
                        <span className="text-[var(--muted-fg)]">Password Strength:</span>
                        <span className="text-[var(--fg)]">{getPasswordStrength(enteredNewPassword).label}</span>
                      </div>
                      <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${getPasswordStrength(enteredNewPassword).color} ${getPasswordStrength(enteredNewPassword).width} transition-all duration-300`} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-[var(--muted-fg)]">Confirm New Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-fg)]" />
                    <input
                      type="password"
                      required
                      value={enteredConfirmNewPassword}
                      onChange={(e) => setEnteredConfirmNewPassword(e.target.value)}
                      placeholder="Confirm your new password"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] px-10 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[var(--primary)] text-white font-black rounded-xl py-2.5 text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Update Password & Login</span>}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
