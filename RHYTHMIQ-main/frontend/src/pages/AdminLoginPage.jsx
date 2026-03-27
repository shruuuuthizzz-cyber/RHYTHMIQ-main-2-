import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Music2, ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { parseErrorDetail } from '@/lib/utils';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await login(email, password);
      
      // Check if user is admin based on backend response
      if (!response?.user?.is_admin) {
        setError('This account does not have admin access.');
        setLoading(false);
        return;
      }
      
      navigate('/admin');
    } catch (err) {
      const errorMsg = parseErrorDetail(err.response?.data?.detail) || 'Admin login failed. Check your credentials.';
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
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-sm text-zinc-400">Admin login is separate from user login.</h2>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-black/60 backdrop-blur-xl p-8 shadow-2xl shadow-black/30">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/50">
              <Lock className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h1 className="font-syne font-extrabold text-2xl tracking-tight">Admin Access</h1>
              <p className="text-xs text-muted-foreground">Administrators only</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-400 mb-1 block">Admin Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white/5 border-white/10 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-red-500/50 pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-400 mb-1 block">Admin Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/5 border-white/10 h-12 rounded-xl text-white placeholder:text-zinc-600 focus:ring-red-500/50 pl-10 pr-12"
                  required
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

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-base transition-colors duration-200"
            >
              {loading ? 'Authenticating...' : 'Admin Sign In'}
              <Lock className="w-4 h-4 ml-2" />
            </Button>
          </form>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 mt-6">
            <div className="text-xs text-zinc-400 leading-5">
              <p className="font-semibold text-red-400 mb-2">Admin Portal</p>
              <p>This page is restricted to authorized administrators only. Unauthorized access attempts are logged.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
