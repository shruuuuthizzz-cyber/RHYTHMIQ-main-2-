import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Music2, ArrowRight, Sparkles, Mail, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const googleButtonRef = useRef(null);
  const { login, register, googleLogin } = useAuth();
  const navigate = useNavigate();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isPreviewHost = ['loca.lt', 'localtunnel.me', 'trycloudflare.com'].some((domain) => hostname.endsWith(domain));
  const canUseGoogleLogin = Boolean(googleClientId) && !isPreviewHost;

  useEffect(() => {
    if (!canUseGoogleLogin || !googleButtonRef.current) {
      return undefined;
    }

    const initializeGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          setError('');
          setMessage('');
          setLoading(true);
          try {
            await googleLogin(response.credential);
            navigate('/');
          } catch (err) {
            setError(err.response?.data?.detail || 'Google login failed.');
          } finally {
            setLoading(false);
          }
        },
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 360,
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
  }, [canUseGoogleLogin, googleLogin, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        setMessage('Signed in. Your listening profile is ready.');
      } else {
        await register(username, email, password);
        setMessage('Account created. Check your inbox for the RHYTHMIQ welcome email.');
      }
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong');
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
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Music2 className="w-6 h-6 text-black" />
          </div>
          <span className="font-syne font-extrabold text-3xl tracking-tight">RHYTHMIQ</span>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-black/60 backdrop-blur-xl p-7 shadow-2xl shadow-black/30">
          <h1 className="font-syne font-extrabold text-4xl tracking-tight mb-2">
            {mode === 'login' ? 'Sign in to your vibe' : 'Start your sound identity'}
          </h1>
          <p className="text-muted-foreground mb-6">
            Spotify-style discovery, YouTube-backed playback, and a Music DNA that evolves with every song.
          </p>

          {canUseGoogleLogin ? (
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.22em] text-zinc-500 mb-3">Quickest way in</p>
              <div ref={googleButtonRef} className="flex justify-center mb-3" />
              <div className="text-center">
                <button
                  onClick={() => navigate('/auth/google')}
                  className="text-sm text-primary hover:underline"
                >
                  Use dedicated Google login page ->
                </button>
              </div>
            </div>
          ) : isPreviewHost ? (
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.22em] text-zinc-500 mb-3">Google Login</p>
              <div className="text-center p-4 rounded-2xl border border-amber-500/20 bg-amber-500/10">
                <p className="text-sm text-amber-200 mb-1">Google sign-in is disabled on this temporary preview link.</p>
                <p className="text-xs text-amber-100/80">Use email/password here, or use a Google-authorized origin in Google Cloud Console.</p>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.22em] text-zinc-500 mb-3">Google Login</p>
              <div className="text-center">
                <p className="text-xs text-zinc-400 mb-2">To enable Google login:</p>
                <p className="text-xs text-zinc-500">Add REACT_APP_GOOGLE_CLIENT_ID to frontend/.env</p>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 mb-6">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5" />
              <div className="text-sm text-zinc-300 leading-6">
                First sign-in sends a welcome email. After that, Brevo is used for a monthly RHYTHMIQ wrap based on what you actually listened to.
              </div>
            </div>
          </div>

          <div className="relative my-5">
            <div className="h-px bg-white/10" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#070707] px-3 text-xs uppercase tracking-[0.24em] text-zinc-500">
              Or use email
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="text-sm font-medium text-zinc-400 mb-1 block">Username</label>
                <Input
                  data-testid="auth-username-input"
                  placeholder="your_vibe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-white/5 border-white/10 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50"
                  required
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-zinc-400 mb-1 block">Email</label>
              <Input
                data-testid="auth-email-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-white/5 border-white/10 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-400 mb-1 block">Password</label>
              <div className="relative">
                <Input
                  data-testid="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/5 border-white/10 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary/50 pr-12"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && <p data-testid="auth-error" className="text-destructive text-sm">{error}</p>}
            {message && (
              <p className="text-emerald-300 text-sm inline-flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>{message}</span>
              </p>
            )}

            <Button
              data-testid="auth-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-full bg-primary text-black font-bold text-base hover:opacity-90 transition-opacity duration-200"
            >
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <p className="text-sm text-zinc-500 mt-6 text-center">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              data-testid="auth-toggle-mode"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}
              className="text-primary hover:underline font-medium"
            >
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>

          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-xs text-zinc-600 text-center mb-3">Administrator Access?</p>
            <button
              onClick={() => navigate('/admin/login')}
              className="w-full px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition-colors duration-200 text-zinc-400 hover:text-zinc-300"
            >
              Admin Portal
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
