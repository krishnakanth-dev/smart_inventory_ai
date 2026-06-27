import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { LogIn, Database, TrendingUp, AlertTriangle, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      console.error("Auth popup error:", err);
      setError(err.message || "Failed to log in with Google. Make sure popup windows are permitted in your browser settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] py-12 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-sm border border-slate-200"
      >
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-3.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
            <TrendingUp className="h-8 w-8" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 font-display">
            SmartStock AI
          </h2>
          <p className="text-sm text-slate-500 font-sans max-w-xs mx-auto">
            Smart Inventory Demand Forecasting and Restocking Optimization System
          </p>
        </div>

        {/* Feature Grid */}
        <div className="py-2 space-y-4">
          <div className="flex gap-3">
            <div className="p-2 bg-slate-50 text-slate-700 rounded-lg border border-slate-100 shrink-0 mt-0.5">
              <TrendingUp className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider font-display">Holt-Winters Seasonality</h4>
              <p className="text-xs text-slate-500">Models weekly spikes, levels, and trends using advanced triple exponential smoothing.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="p-2 bg-slate-50 text-slate-700 rounded-lg border border-slate-100 shrink-0 mt-0.5">
              <Database className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider font-display">PostgreSQL Datastore</h4>
              <p className="text-xs text-slate-500">Transactional database on Cloud SQL to manage stock entries and sales history securely.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="p-2 bg-slate-50 text-slate-700 rounded-lg border border-slate-100 shrink-0 mt-0.5">
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider font-display">Gemini-Powered AI</h4>
              <p className="text-xs text-slate-500">Provides deep reasoning demand outlooks, automated reorder targets, and daily action items.</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-xs p-3.5 rounded-lg flex items-start gap-2 border border-red-100">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <button
            id="google-signin-btn"
            onClick={handleSignIn}
            disabled={loading}
            className="group relative w-full flex justify-center py-3.5 px-4 border border-slate-200 text-sm font-semibold rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-sm gap-2.5 items-center disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <span className="h-4 w-4 border-2 border-zinc-400 border-t-zinc-700 rounded-full animate-spin"></span>
            ) : (
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.927h6.6a5.64 5.64 0 0 1-2.44 3.7l3.78 2.93c2.21-2.03 3.8-5.03 3.8-8.487z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.78-2.93c-1.05.7-2.39 1.12-4.18 1.12-3.21 0-5.93-2.17-6.9-5.1H1.3l-3.52 2.73C4.24 20.35 7.82 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.1 14.18a7.16 7.16 0 0 1 0-4.36V7.09H1.3a11.94 11.94 0 0 0 0 9.82l3.8-2.73z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.96 1.19 15.24 0 12 0 7.82 0 4.24 3.65 1.3 7.09l3.8 2.73c.97-2.93 3.69-5.07 6.9-5.07z"
                />
              </svg>
            )}
            <span>{loading ? "Authorizing with Google..." : "Continue with Google"}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
