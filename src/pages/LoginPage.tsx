import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/common/Toast';
import { Home, Lock, Mail, ArrowRight, HelpCircle, AlertTriangle } from 'lucide-react';

interface LoginPageProps {}

export const LoginPage: React.FC<LoginPageProps> = () => {
  const { signIn, resetPassword, isConfigured } = useAuth();
  const { showToast, showError } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      showToast('Fields Required', 'Please enter your email and password.', 'warning');
      return;
    }

    try {
      setLoading(true);
      const { error } = await signIn(email.trim(), password.trim());
      if (error) throw error;
      showToast('Welcome Back', 'Logged in successfully.');
    } catch (err: any) {
      showError(err, 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      showToast('Email Required', 'Please enter your account email to receive reset instructions.', 'warning');
      return;
    }

    try {
      setLoading(true);
      const { error } = await resetPassword(email.trim());
      if (error) throw error;
      showToast('Reset Link Sent', 'Check your email inbox for password reset instructions.');
      setIsForgotPassword(false);
    } catch (err: any) {
      showError(err, 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-white text-slate-900 rounded-3xl shadow-2xl border border-slate-100/20 overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-br from-brand-600 to-emerald-700 p-7 text-white text-center relative overflow-hidden">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Home className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">Homestay Manager</h2>
          <p className="text-xs text-brand-100 mt-1">Multi-Property Hospitality & Booking System</p>
        </div>

        {/* Supabase Not Configured Warning Banner */}
        {!isConfigured && (
          <div className="bg-amber-50 border-b border-amber-200 p-4 text-xs text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">Supabase Database Not Connected</p>
              <p className="text-slate-600">
                Please add your <code className="bg-amber-100/80 px-1 rounded font-mono">VITE_SUPABASE_URL</code> and <code className="bg-amber-100/80 px-1 rounded font-mono">VITE_SUPABASE_ANON_KEY</code> into the <code className="bg-amber-100/80 px-1 rounded font-mono">.env</code> file.
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-7">
          {isForgotPassword ? (
            /* Forgot Password Form */
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Forgot Password?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter your registered staff email and we will send you a password recovery link.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-brand-600" />
                  Staff Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@homestay.com"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(false)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  ← Back to Login
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          ) : (
            /* Standard Login Form */
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-brand-600" />
                  Staff Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@homestay.com"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-brand-600" />
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    Forgot?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-600/30 flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:scale-[1.01]"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In with Supabase'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px] text-slate-500 text-center">
                Strict database authentication. Direct connection to Supabase PostgreSQL.
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
