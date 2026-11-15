import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Mail, Lock, Smartphone, X, Eye, EyeOff, Check, ArrowLeft, Timer, RefreshCw, Key, Copy, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { safeJson } from '../utils/apiHelper';
import { safeSetItem, sanitizeUserForStorage } from '../utils/storageHelper';

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

  // GreenPin OTP Forgot Password Flow States
  const [forgotStep, setForgotStep] = useState<'identifier' | 'otp' | 'password' | 'success'>('identifier');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [resetRequestId, setResetRequestId] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [maskedTarget, setMaskedTarget] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [otpExpiresSeconds, setOtpExpiresSeconds] = useState(0);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Mandatory Change Password States (Legacy fallback compatibility)
  const [tempPasswordUserId, setTempPasswordUserId] = useState<string | null>(null);
  const [tempPasswordUsed, setTempPasswordUsed] = useState<string>('');
  const [enteredNewPassword, setEnteredNewPassword] = useState('');
  const [enteredConfirmNewPassword, setEnteredConfirmNewPassword] = useState('');
  const [showEnteredNewPassword, setShowEnteredNewPassword] = useState(false);

  // Resend Cooldown Timer
  useEffect(() => {
    let interval: any = null;
    if (cooldownSeconds > 0) {
      interval = setInterval(() => {
        setCooldownSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // OTP Expiry Countdown Timer
  useEffect(() => {
    let interval: any = null;
    if (otpExpiresSeconds > 0) {
      interval = setInterval(() => {
        setOtpExpiresSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpExpiresSeconds]);

  // Reset errors on form changes
  useEffect(() => {
    setErrorMsg(null);
  }, [identifier, password, fullName, regEmail, regPhone, regPassword, regConfirmPassword, forgotIdentifier, otpCode, newPassword, confirmNewPassword, tab, enteredNewPassword, enteredConfirmNewPassword]);

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
        safeSetItem('sabjies_saved_identifier', identifier.trim());
      } else {
        localStorage.removeItem('sabjies_saved_identifier');
      }

      // Save sanitized user session
      safeSetItem('sabjies_current_user', JSON.stringify(sanitizeUserForStorage(data.user)));
      safeSetItem('sabjies_session_id', data.sessionId);

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

      // Auto-login immediately upon successful registration
      if (data.sessionId && data.user) {
        safeSetItem('sabjies_current_user', JSON.stringify(sanitizeUserForStorage(data.user)));
        safeSetItem('sabjies_session_id', data.sessionId);
        onRegisterSuccess(data.user);
        onLoginSuccess(data.user, data.sessionId);
        onClose();
        return;
      }

      // Fallback redirect to sign in
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

  // ── GREENPIN OTP FORGOT PASSWORD HANDLERS ──

  // Format timer as MM:SS
  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Step 1: Submit Email or Mobile Number to receive OTP
  const handleForgotIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = forgotIdentifier.trim();
    if (!id) {
      setErrorMsg('Please enter your registered email address or mobile number.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: id })
      });
      const data = await safeJson(res, { error: 'Failed to initiate password reset.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to send verification code.');
      }

      setResetRequestId(data.resetRequestId);
      setMaskedTarget(data.maskedTarget || id);
      setChannel(data.channel || (id.includes('@') ? 'email' : 'sms'));
      setCooldownSeconds(data.cooldownSeconds || 60);
      setOtpExpiresSeconds(data.expiresIn || 300);
      setForgotStep('otp');
      setOtpCode('');
      setInfoMsg(data.message || 'A 6-digit verification code has been dispatched.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not send verification code. Please check your network and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Resend OTP (Respecting 60s cooldown)
  const handleResendOtp = async () => {
    if (cooldownSeconds > 0 || !resetRequestId) return;
    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetRequestId })
      });
      const data = await safeJson(res, { error: 'Failed to resend code.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Failed to resend verification code.');
      }

      setCooldownSeconds(data.cooldownSeconds || 60);
      setOtpExpiresSeconds(data.expiresIn || 300);
      setInfoMsg('A fresh verification code has been dispatched!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not resend verification code. Please wait.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Verify 6-digit OTP code
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otpCode.trim();
    if (!cleanOtp) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }
    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorMsg('Verification code must be exactly 6 digits.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetRequestId, otp: cleanOtp })
      });
      const data = await safeJson(res, { error: 'Verification failed.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Invalid verification code.');
      }

      setVerificationToken(data.verificationToken);
      setForgotStep('password');
      setInfoMsg('Verification code confirmed! Please enter your new password.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Incorrect verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Choose and confirm new password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmNewPassword) {
      setErrorMsg('Please enter and confirm your new password.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMsg('New password and confirm password do not match.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetRequestId,
          verificationToken,
          newPassword,
          confirmPassword: confirmNewPassword
        })
      });
      const data = await safeJson(res, { error: 'Failed to reset password.' });
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Password reset failed.');
      }

      setForgotStep('success');
      setInfoMsg(data.message || 'Password updated successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Return to Login screen after password changed
  const handleReturnToLogin = () => {
    setTab('login');
    setIdentifier(forgotIdentifier);
    setPassword('');
    setForgotStep('identifier');
    setOtpCode('');
    setNewPassword('');
    setConfirmNewPassword('');
    setErrorMsg(null);
    setInfoMsg('Password updated! Please log in with your new credentials.');
  };

  // Legacy temporary password handler (if triggered during admin login)
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

      safeSetItem('sabjies_current_user', JSON.stringify(sanitizeUserForStorage(data.user)));
      safeSetItem('sabjies_session_id', data.sessionId);

      onLoginSuccess(data.user, data.sessionId);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error changing password.');
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
        {errorMsg && (() => {
          const isNegative = /failed|not|could not|cannot|unavailable|error|invalid|blocked|suspended|wait/i.test(errorMsg);
          const isSuccess = !isNegative && /successful|verified|dispatched/i.test(errorMsg);
          return (
            <div className={`p-3 rounded-xl mb-4 text-xs font-bold leading-relaxed border ${
              isSuccess
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <div>{errorMsg}</div>
              {errorMsg.includes('greensabjies@gmail.com') && (
                <div className="mt-2 pt-2 border-t border-rose-200 flex flex-wrap gap-3 text-[11px] font-semibold text-rose-900">
                  <a href="mailto:greensabjies@gmail.com" className="hover:underline flex items-center gap-1">
                    ✉️ greensabjies@gmail.com
                  </a>
                  <a href="tel:+919920324172" className="hover:underline flex items-center gap-1">
                    📞 +91 99203 24172
                  </a>
                </div>
              )}
            </div>
          );
        })()}

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
              {infoMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 leading-relaxed flex items-start gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>{infoMsg}</span>
                </div>
              )}

              {/* ── STEP 1: ENTER REGISTERED EMAIL OR MOBILE ── */}
              {forgotStep === 'identifier' && (
                <form onSubmit={handleForgotIdentifierSubmit} className="space-y-4">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('login');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted-fg)] hover:text-[var(--primary)] mb-1 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back to Login</span>
                  </button>

                  <div className="space-y-1">
                    <h3 className="text-base font-black text-[var(--fg)]">Forgot Password</h3>
                    <p className="text-[11px] text-[var(--muted-fg)] leading-relaxed">
                      Enter your registered email address or mobile number. We will send you a 6-digit verification code.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-1">
                    <label className="text-xs font-bold text-[var(--muted-fg)]">Registered Email or Mobile Number *</label>
                    <div className="relative">
                      {forgotIdentifier.includes('@') ? (
                        <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--primary)]" />
                      ) : (
                        <Smartphone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--primary)]" />
                      )}
                      <input
                        type="text"
                        required
                        autoFocus
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder="e.g. yourname@gmail.com or 9876543210"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] pl-10 pr-3.5 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)] transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !forgotIdentifier.trim()}
                    className="w-full bg-[var(--primary)] text-white font-bold rounded-xl py-2.5 text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Send Verification Code</span>}
                  </button>

                  <div className="text-center pt-2">
                    <span className="text-[10px] text-[var(--muted-fg)]">
                      Instant OTP delivery via secure Email & SMS gateways
                    </span>
                  </div>
                </form>
              )}

              {/* ── STEP 2 & 3: ENTER 6-DIGIT OTP ── */}
              {forgotStep === 'otp' && (
                <form onSubmit={handleVerifyOtpSubmit} className="space-y-4">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep('identifier');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted-fg)] hover:text-[var(--primary)] mb-1 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Change Email / Mobile</span>
                  </button>

                  <div className="space-y-1">
                    <h3 className="text-base font-black text-[var(--fg)]">Enter Verification Code</h3>
                    <p className="text-[11px] text-[var(--muted-fg)] leading-relaxed">
                      We sent a 6-digit verification code to <strong className="text-[var(--fg)]">{maskedTarget}</strong> via {channel === 'email' ? 'Email' : 'SMS'}.
                    </p>
                  </div>

                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--input-bg)] border border-[var(--border)] text-[11px]">
                    <span className="flex items-center gap-1 text-[var(--muted-fg)] font-medium">
                      <Timer className="h-3.5 w-3.5 text-amber-500" /> Code expires in:
                    </span>
                    <span className="font-mono font-black text-amber-600">{formatTimer(otpExpiresSeconds)}</span>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-1">
                    <label className="text-xs font-bold text-[var(--muted-fg)] text-center">6-Digit Code</label>
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={6}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      className="w-full text-center tracking-[0.5em] font-mono text-xl font-black rounded-xl border border-[var(--border)] bg-[var(--input-bg)] py-3 text-[var(--fg)] outline-none focus:border-[var(--primary)] transition-all"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    {cooldownSeconds > 0 ? (
                      <span className="text-[var(--muted-fg)] font-medium">
                        Resend code in <strong className="text-[var(--fg)] font-mono">{cooldownSeconds}s</strong>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={isLoading}
                        className="text-[var(--primary)] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Resend OTP Code</span>
                      </button>
                    )}
                    <span className="text-[10px] text-[var(--muted-fg)]">Max 5 attempts</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || otpCode.length !== 6}
                    className="w-full bg-[var(--primary)] text-white font-bold rounded-xl py-2.5 text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Verify & Continue</span>}
                  </button>
                </form>
              )}

              {/* ── STEP 4: CHOOSE NEW PASSWORD ── */}
              {forgotStep === 'password' && (
                <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-black text-[var(--fg)]">Create New Password</h3>
                    <p className="text-[11px] text-[var(--muted-fg)] leading-relaxed">
                      Your identity has been verified. Choose a secure new password for your Sabjies account.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-1">
                    <label className="text-xs font-bold text-[var(--muted-fg)]">New Password *</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-fg)]" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        autoFocus
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter at least 6 characters"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] pl-10 pr-10 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-fg)] hover:text-[var(--fg)]"
                      >
                        {showNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {newPassword && (
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-[var(--muted-fg)]">Strength</span>
                          <span className="font-bold">{getPasswordStrength(newPassword).label}</span>
                        </div>
                        <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full ${getPasswordStrength(newPassword).color} ${getPasswordStrength(newPassword).width} transition-all duration-300`} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[var(--muted-fg)]">Confirm New Password *</label>
                      {confirmNewPassword && newPassword === confirmNewPassword && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                          <Check className="h-3 w-3" /> Passwords match
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-fg)]" />
                      <input
                        type={showConfirmNewPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-enter your new password"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] pl-10 pr-10 py-2.5 text-xs text-[var(--fg)] font-medium outline-none focus:border-[var(--primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-fg)] hover:text-[var(--fg)]"
                      >
                        {showConfirmNewPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || newPassword.length < 6 || newPassword !== confirmNewPassword}
                    className="w-full bg-[var(--primary)] text-white font-bold rounded-xl py-2.5 text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>Update Password</span>}
                  </button>
                </form>
              )}

              {/* ── STEP 5: SUCCESS CONFIRMATION ── */}
              {forgotStep === 'success' && (
                <div className="space-y-4 text-center py-4">
                  <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
                    <Check className="h-8 w-8 stroke-[3]" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-[var(--fg)]">Password Reset Complete!</h3>
                    <p className="text-xs text-[var(--muted-fg)] leading-relaxed max-w-xs mx-auto">
                      Your password has been changed successfully. All previous sessions have been signed out for security.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-800 font-medium">
                    You can now log in securely using your new credentials.
                  </div>

                  <button
                    type="button"
                    onClick={handleReturnToLogin}
                    className="w-full bg-[var(--primary)] text-white font-black rounded-xl py-2.5 text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Proceed to Login</span>
                  </button>
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
