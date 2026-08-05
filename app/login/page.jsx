'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import CFIcon from '@/assets/cloudflare-icon.svg';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']); // 6-digit OTP state
  const [showPassword, setShowPassword] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const otpString = otp.join('');
  const isFormValid = username && password && otpString.length === 6;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (processing) return;
    setProcessing(true);
    setError('');

    const result = await signIn('credentials', {
      redirect: false,
      username,
      password,
      otp: otpString, // Pass OTP to NextAuth
    });

    if (result?.error) {
      const msg = 'Invalid credentials or authenticator code';
      setError(msg);
      toast.error(msg);
      setProcessing(false);
    } else {
      router.push('/upload');
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 bg-base">
      {/* Dotted background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse at center, black 35%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 35%, transparent 80%)',
        }}
      />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }} className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-10">
          <Image src={CFIcon} alt="Cloudflare" width={40} height={40} />
          <h1 className="text-2xl font-semibold text-white">R2 Drive</h1>
          <p className="text-sm text-ink-muted">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="username"
            label="Username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) setError('');
            }}
            placeholder="ayush"
            disabled={processing}
          />

          <Input
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder="••••••••"
            disabled={processing}
            suffix={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-ink-faint hover:text-ink-muted transition"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />

          {/* OTP 6-Box Input Component */}
          <OTPInput otp={otp} setOtp={setOtp} disabled={processing} setError={setError} />

          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-red-400">
              {error}
            </motion.div>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={processing || !isFormValid}
            className="w-full py-2.5 mt-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Signing in…
              </span>
            ) : (
              'Sign in'
            )}
          </motion.button>
        </form>

        <p className="mt-8 text-center text-xs text-ink-faint">Cloudflare R2 · Next.js</p>
      </motion.div>
    </div>
  );
}

function Input({ id, label, suffix, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          required
          {...props}
          className={`w-full ${suffix ? 'pr-10' : 'pr-3'} pl-3 py-2.5 rounded-md bg-surface border border-line text-[15px] text-white placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition disabled:opacity-60`}
        />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2">{suffix}</span>}
      </div>
    </div>
  );
}

const OTP_LENGTH = 6;

function OTPInput({ otp, setOtp, disabled, setError }) {
  const focusBox = (index) => {
    const el = document.getElementById(`otp-${Math.max(0, Math.min(index, OTP_LENGTH - 1))}`);
    el?.focus();
    el?.select();
  };

  /**
   * Write `digits` into the boxes starting at `startIndex`.
   *
   * Everything funnels through here — typing, pasting, and password-manager
   * autofill. Autofill in particular does NOT emit a paste event: extensions
   * assign the whole code to one box's value and dispatch `input`, so the
   * change handler has to cope with a multi-character value instead of
   * assuming one keystroke per box.
   */
  const fillFrom = (startIndex, digits) => {
    const clean = digits.replace(/\D/g, '');
    if (!clean) return;

    const next = [...otp];
    // A complete code always lands in box 0, wherever it was dropped.
    const start = clean.length >= OTP_LENGTH ? 0 : startIndex;

    for (let i = 0; i < clean.length && start + i < OTP_LENGTH; i++) {
      next[start + i] = clean[i];
    }

    setOtp(next);
    setError('');
    focusBox(start + clean.length);
  };

  const handleChange = (value, index) => {
    if (value === '') {
      const next = [...otp];
      next[index] = '';
      setOtp(next);
      setError('');
      return;
    }
    fillFrom(index, value);
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      if (otp[index]) return; // let the change handler clear this box
      e.preventDefault();
      if (index > 0) {
        const next = [...otp];
        next[index - 1] = '';
        setOtp(next);
        focusBox(index - 1);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (e, index) => {
    e.preventDefault();
    const clip = e.clipboardData;
    // Extensions are inconsistent about the flavour they publish.
    const text = clip.getData('text/plain') || clip.getData('text') || clip.getData('Text') || '';
    fillFrom(index, text.slice(0, 32));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex justify-between items-center px-0.5">
        <label htmlFor="otp-0" className="block text-xs font-medium text-ink-faint uppercase tracking-wider">
          Verification Code
        </label>
      </div>
      <div className="flex gap-2 sm:gap-3 justify-between">
        {otp.map((data, index) => (
          <input
            key={index}
            id={`otp-${index}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            // No maxLength: the browser would clip a 6-digit paste to one
            // character before React ever sees it.
            // Only the first box advertises one-time-code, otherwise browsers
            // race to autofill all six with the same full string.
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
            value={data}
            disabled={disabled}
            onChange={(e) => handleChange(e.target.value, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onPaste={(e) => handlePaste(e, index)}
            onFocus={(e) => e.target.select()}
            className="w-10 h-11 sm:w-11 sm:h-12 text-center rounded-md bg-surface border border-line text-lg font-bold text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-50 placeholder:text-ink-faint"
          />
        ))}
      </div>
    </div>
  );
}
