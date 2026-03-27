import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { authAPI } from '@/lib/api';
import { Music2, ArrowRight, Sparkles, Mail, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { motion } from 'framer-motion';
import { parseErrorDetail } from '@/lib/utils';

const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const googleButtonRef = useRef(null);
  const { login, register, googleLogin } = useAuth();
  const navigate = useNavigate();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isPreviewHost = ['loca.lt', 'localtunnel.me', 'trycloudflare.com'].some((domain) => hostname.endsWith(domain));
  const canUseGoogleLogin = Boolean(googleClientId) && !isPreviewHost;

  // Load saved credentials on mount
  useEffect(() => {
    const savedCredentials = localStorage.getItem('rhythmiq_remembered_credentials');
    if (savedCredentials) {
      try {
        const { email: savedEmail, rememberMe: saved } = JSON.parse(savedCredentials);
        setIdentifier(savedEmail);
        setEmail(savedEmail);
        setRememberMe(saved);
      } catch (e) {
        console.error('Error loading saved credentials:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!canUseGoogleLogin || !googleButtonRef.current) {
      return undefined;
    }

    const initializeGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      const containerWidth = googleButtonRef.current.parentElement?.offsetWidth || 320;
      const buttonWidth = Math.min(containerWidth - 20, isMobile ? 280 : 360);

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          setError('');
          setMessage('');
          setGoogleLoading(true);
          try {
            await googleLogin(response.credential);
            setMessage('Sign in successful! Redirecting...');
            setTimeout(() => navigate('/'), 1500);
          } catch (err) {
            const errorMsg = parseErrorDetail(err.response?.data?.detail) || err.message || 'Google login failed. Please try again.';
            setError(errorMsg);
            setGoogleLoading(false);
          }
        },
        error_callback: () => {
          setError('Google login error. Please try again.');
          setGoogleLoading(false);
        },
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: buttonWidth,
      });
    };

    if (window.google?.accounts?.id) {
      initializeGoogleButton();
      return undefined;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleButton;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [canUseGoogleLogin, googleLogin, navigate, isMobile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(identifier, password);
        // Save credentials if remember me is checked
        if (rememberMe) {
          localStorage.setItem('rhythmiq_remembered_credentials', JSON.stringify({
            email: identifier,
            rememberMe: true,
          }));
        } else {
          localStorage.removeItem('rhythmiq_remembered_credentials');
        }
        setMessage('Signed in. Your listening profile is ready. Redirecting...');
        setTimeout(() => navigate('/'), 1500);
      } else {
        await register(username, email, password);
        // Keep user on register to confirm. Do not auto-login.
        setMessage('Account created successfully! Please sign in with your credentials.');
        setMode('login');
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        setError('Invalid credentials. Please check your email/username and password.');
      } else {
        const errorMsg = parseErrorDetail(err.response?.data?.detail) || err.message || 'Something went wrong.';
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await authAPI.forgotPassword({ email: forgotEmail });
      setMessage(response.data?.detail || 'OTP sent to your email. Please check your inbox.');
      setResetEmail(forgotEmail);
      setShowForgotPassword(false);
      setShowResetPassword(true);
    } catch (err) {
      const errorMsg = parseErrorDetail(err.response?.data?.detail) || err.message || 'Error sending password reset instructions.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const response = await authAPI.resetPassword({ 
        email: resetEmail, 
        otp: otp, 
        new_password: newPassword 
      });
      setMessage(response.data?.detail || 'Password reset successfully! You can now sign in with your new password.');
      setShowResetPassword(false);
      setMode('login');
      setOtp('');
      setNewPassword('');
      setResetEmail('');
    } catch (err) {
      const errorMsg = parseErrorDetail(err.response?.data?.detail) || err.message || 'Error resetting password.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1493225255756-d9584f8606e9?auto=format&fit=crop&q=80&w=2000"
          alt=""
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md mx-4 px-3 sm:px-4"
      >
        <div className="flex items-center gap-2 md:gap-3 mb-6 md:mb-8 flex-col sm:flex-row">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
            <Music2 className="w-5 h-5 md:w-6 md:h-6 text-black" />
          </div>
          <span className="font-syne font-extrabold text-2xl md:text-3xl tracking-tight text-center sm:text-left">RHYTHMIQ</span>
        </div>

        <div className="rounded-2xl md:rounded-[28px] border border-white/10 bg-black/60 backdrop-blur-xl p-5 md:p-7 shadow-2xl shadow-black/30">
          <h1 className="font-syne font-extrabold text-2xl md:text-4xl tracking-tight mb-2">
            {mode === 'login' ? 'Sign in to your vibe' : 'Start your sound identity'}
          </h1>
          <p className="text-muted-foreground mb-6 text-sm md:text-base">
            Spotify-style discovery, YouTube-backed playback, and a Music DNA that evolves with every song.
          </p>

          {canUseGoogleLogin ? (
            <div className="mb-6">
              <p className="text-xs md:text-sm uppercase tracking-[0.22em] text-zinc-500 mb-3">Quickest way in</p>
              <div ref={googleButtonRef} className="flex justify-center mb-3" />
              <div className="text-center">
                <button
                  onClick={() => navigate('/auth/google')}
                  className="text-xs md:text-sm text-primary hover:underline"
                >
                  Use dedicated Google login page ->
                </button>
              </div>
            </div>
          ) : isPreviewHost ? (
            <div className="mb-6">
              <p className="text-xs md:text-sm uppercase tracking-[0.22em] text-zinc-500 mb-3">Google Login</p>
              <div className="text-center p-3 md:p-4 rounded-2xl border border-amber-500/20 bg-amber-500/10">
                <p className="text-xs md:text-sm text-amber-200 mb-1">Google sign-in is disabled on this temporary preview link.</p>
                <p className="text-xs text-amber-100/80">Use email/password here, or use a Google-authorized origin in Google Cloud Console.</p>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <p className="text-xs md:text-sm uppercase tracking-[0.22em] text-zinc-500 mb-3">Google Login</p>
              <div className="text-center">
                <p className="text-xs md:text-sm text-zinc-400 mb-2">To enable Google login:</p>
                <p className="text-xs text-zinc-500">Add REACT_APP_GOOGLE_CLIENT_ID to frontend/.env</p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:p-4 mb-6">
            <div className="flex items-start gap-2 md:gap-3">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-xs md:text-sm text-zinc-300 leading-6">
                First sign-in sends a welcome email. After that, Brevo is used for a monthly RHYTHMIQ wrap based on what you actually listened to.
              </div>
            </div>
          </div>

          <div className="relative my-4 md:my-5">
            <div className="h-px bg-white/10" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#070707] px-3 text-xs uppercase tracking-[0.24em] text-zinc-500">
              Or use email
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
            {mode === 'register' ? (
              <>
                <div>
                  <label className="text-xs md:text-sm font-medium text-zinc-400 mb-1 block">Username</label>
                  <Input
                    data-testid="auth-username-input"
                    placeholder="your_vibe"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-white/5 border-white/10 h-10 md:h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs md:text-sm font-medium text-zinc-400 mb-1 block">Email</label>
                  <Input
                    data-testid="auth-email-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/5 border-white/10 h-10 md:h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50 text-sm"
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="text-xs md:text-sm font-medium text-zinc-400 mb-1 block">Username or Email</label>
                <Input
                  data-testid="auth-identifier-input"
                  placeholder="username or email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="bg-white/5 border-white/10 h-10 md:h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50 text-sm"
                  required
                />
              </div>
            )}

            <div>
              <label className="text-xs md:text-sm font-medium text-zinc-400 mb-1 block">Password</label>
              <div className="relative">
                <Input
                  data-testid="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/5 border-white/10 h-10 md:h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50 pr-10 md:pr-12 text-sm"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4 md:w-5 md:h-5" /> : <Eye className="w-4 h-4 md:w-5 md:h-5" />}
                </button>
              </div>
            </div>

            {mode === 'login' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={setRememberMe}
                  className="border-white/20"
                />
                <label htmlFor="remember-me" className="text-xs md:text-sm font-medium text-zinc-400 cursor-pointer">
                  Remember my email for next time
                </label>
              </div>
            )}

            {error && <p data-testid="auth-error" className="text-destructive text-xs md:text-sm">{error}</p>}
            {message && (
              <p className="text-emerald-300 text-xs md:text-sm inline-flex items-center gap-2">
                <Mail className="w-3 h-3 md:w-4 md:h-4" />
                <span>{message}</span>
              </p>
            )}

            <Button
              data-testid="auth-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full h-10 md:h-12 rounded-full bg-primary text-black font-bold text-sm md:text-base hover:opacity-90 transition-opacity duration-200"
            >
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          {mode === 'login' && (
            <div className="mt-3 mb-3 text-center">
              {!showForgotPassword ? (
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(true); setError(''); setMessage(''); }}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </button>
              ) : (
                <form onSubmit={handleForgotPassword} className="mt-3 space-y-3">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="bg-white/5 border-white/10 h-10 md:h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50 text-sm"
                    required
                  />
                  <Button type="submit" size="sm" className="w-full bg-secondary text-black">
                    Send reset instructions
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-zinc-400 hover:text-white"
                    onClick={() => setShowForgotPassword(false)}
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          )}

          {showResetPassword && (
            <div className="mt-3 mb-3">
              <form onSubmit={handleResetPassword} className="space-y-3">
                <div>
                  <label className="text-xs md:text-sm font-medium text-zinc-400 mb-1 block">OTP</label>
                  <Input
                    type="text"
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="bg-white/5 border-white/10 h-10 md:h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50 text-sm text-center tracking-widest"
                    maxLength={6}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs md:text-sm font-medium text-zinc-400 mb-1 block">New Password</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-white/5 border-white/10 h-10 md:h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50 pr-10 md:pr-12 text-sm"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 md:w-5 md:h-5" /> : <Eye className="w-4 h-4 md:w-5 md:h-5" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" size="sm" className="w-full bg-secondary text-black">
                  Reset Password
                </Button>
                <button
                  type="button"
                  className="text-xs text-zinc-400 hover:text-white block w-full"
                  onClick={() => {
                    setShowResetPassword(false);
                    setOtp('');
                    setNewPassword('');
                    setResetEmail('');
                    setError('');
                    setMessage('');
                  }}
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          <p className="text-xs md:text-sm text-zinc-500 mt-4 md:mt-6 text-center">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              data-testid="auth-toggle-mode"
              onClick={() => { 
                setMode(mode === 'login' ? 'register' : 'login'); 
                setError(''); 
                setMessage('');
                setRememberMe(false);
              }}
              className="text-primary hover:underline font-medium"
            >
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
