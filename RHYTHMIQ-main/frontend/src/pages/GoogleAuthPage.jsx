import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Music2, ArrowLeft, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

export default function GoogleAuthPage() {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const googleButtonRef = useRef(null);
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isPreviewHost = ['loca.lt', 'localtunnel.me', 'trycloudflare.com'].some((domain) => hostname.endsWith(domain));
  const canUseGoogleLogin = Boolean(googleClientId) && !isPreviewHost;

  useEffect(() => {
    if (isPreviewHost) {
      setError('Google login is disabled on temporary preview links. Use email/password for this preview.');
      return;
    }

    if (!googleClientId) {
      setError('Google Client ID not configured. Please check your environment variables.');
      return;
    }

    if (!googleButtonRef.current) {
      return;
    }

    const initializeGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      const containerWidth = googleButtonRef.current.parentElement?.offsetWidth || 320;
      const buttonWidth = Math.min(containerWidth - 20, isMobile ? 280 : 400);

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
            setError(err.response?.data?.detail || err.message || 'Google login failed. Please try again.');
            setGoogleLoading(false);
          }
        },
        error_callback: () => {
          setError('Google login error. Please try again or use email login instead.');
          setGoogleLoading(false);
        },
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: buttonWidth,
      });
    };

    if (window.google?.accounts?.id) {
      initializeGoogleButton();
      return;
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
  }, [googleLogin, isPreviewHost, navigate, isMobile]);

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
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <button
            onClick={() => navigate('/auth')}
            className="text-zinc-400 hover:text-white transition-colors p-1.5"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <Music2 className="w-5 h-5 md:w-6 md:h-6 text-black" />
            </div>
            <span className="font-syne font-extrabold text-2xl md:text-3xl tracking-tight">RHYTHMIQ</span>
          </div>
        </div>

        <div className="rounded-2xl md:rounded-[28px] border border-white/10 bg-black/60 backdrop-blur-xl p-5 md:p-8 shadow-2xl shadow-black/30">
          <h1 className="font-syne font-extrabold text-2xl md:text-4xl tracking-tight mb-2 text-center">
            Sign in with Google
          </h1>
          <p className="text-muted-foreground mb-6 md:mb-8 text-center text-sm md:text-base">
            Continue with your Google account to access RHYTHMIQ
          </p>

          {error && (
            <div className="mb-6 p-3 md:p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs md:text-sm text-red-400">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-6 p-3 md:p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs md:text-sm text-green-400">{message}</p>
            </div>
          )}

          <div className="mb-6">
            <p className="text-xs md:text-sm uppercase tracking-[0.22em] text-zinc-500 mb-4 text-center">Sign in with</p>
            {canUseGoogleLogin ? (
              <div ref={googleButtonRef} className="flex justify-center" />
            ) : (
              <div className="text-center p-4 md:p-6 rounded-lg bg-white/5 border border-white/10">
                <p className="text-xs md:text-sm text-zinc-400 mb-2">
                  {isPreviewHost ? 'Google login is disabled on preview links' : 'Google login not configured'}
                </p>
                <p className="text-xs text-zinc-500">
                  {isPreviewHost
                    ? 'Go back and sign in with email/password.'
                    : 'Add REACT_APP_GOOGLE_CLIENT_ID to your environment variables'}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:p-4">
            <div className="flex items-start gap-2 md:gap-3">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-xs md:text-sm text-zinc-300 leading-6">
                By signing in, you'll get access to personalized music recommendations,
                playlist creation, and your listening history across all your devices.
              </div>
            </div>
          </div>

          {loading && (
            <div className="mt-6 flex items-center justify-center">
              <div className="flex items-end gap-1 h-6">
                <div className="sound-bar" />
                <div className="sound-bar" />
                <div className="sound-bar" />
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
