'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [showForm, setShowForm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    intent: '',
    telegramUsername: '',
    wantsImmediateStart: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Background gradient effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-zinc-900/50 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-zinc-800/30 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 py-12 text-center max-w-4xl mx-auto">
        {/* Animated Globe Icon */}
        <div className={`mb-12 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="relative w-24 h-24 mx-auto">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full animate-globe-materialize"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              {/* Main circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                className="animate-draw-circle"
                strokeDasharray="283"
                strokeDashoffset="283"
              />
              {/* Horizontal line */}
              <ellipse
                cx="50"
                cy="50"
                rx="45"
                ry="18"
                className="animate-draw-ellipse-h"
                strokeDasharray="200"
                strokeDashoffset="200"
              />
              {/* Vertical meridian */}
              <ellipse
                cx="50"
                cy="50"
                rx="18"
                ry="45"
                className="animate-draw-ellipse-v"
                strokeDasharray="200"
                strokeDashoffset="200"
              />
              {/* Additional latitude lines */}
              <ellipse
                cx="50"
                cy="32"
                rx="38"
                ry="10"
                className="animate-draw-lat opacity-60"
                strokeDasharray="150"
                strokeDashoffset="150"
              />
              <ellipse
                cx="50"
                cy="68"
                rx="38"
                ry="10"
                className="animate-draw-lat-2 opacity-60"
                strokeDasharray="150"
                strokeDashoffset="150"
              />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <h1
          className={`text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-8 transition-all duration-1000 delay-300 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.02em' }}
        >
          PRIVATE MARKET INTELLIGENCE
        </h1>

        {/* Subheading */}
        <p
          className={`text-lg md:text-xl text-zinc-400 max-w-3xl mb-12 leading-relaxed transition-all duration-1000 delay-500 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          PROPRIETARY DATA INTERWOVEN WITH ARTIFICIAL INTELLIGENCE TO UNCOVER ALPHA AND OPPORTUNITIES IN PRIVATE MARKETS.
        </p>

        {/* Request Access Button */}
        <div
          className={`transition-all duration-1000 delay-700 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <button
            onClick={() => setShowForm(!showForm)}
            className="group relative inline-flex items-center gap-2 text-xl font-semibold tracking-wide hover:text-zinc-300 transition-colors"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            REQUEST ACCESS
            <span className="inline-block animate-arrow-bounce">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform group-hover:translate-x-1"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </button>
        </div>

        {/* Dropdown Form */}
        <div
          className={`w-full max-w-lg mt-8 overflow-hidden transition-all duration-500 ease-out ${
            showForm ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          {submitted ? (
            <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold mb-2">Request Received</h3>
              <p className="text-zinc-400">
                Thank you for your interest. We&apos;ll review your request and get back to you shortly.
              </p>
              {formData.wantsImmediateStart && (
                <p className="text-zinc-400 mt-4">
                  Want to chat now? Join our{' '}
                  <a
                    href="https://t.me/yourgroup"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Telegram group
                  </a>
                </p>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 space-y-5"
            >
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2 text-left">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Your name"
                  className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2 text-left">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@company.com"
                  className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                />
              </div>

              {/* Intent */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2 text-left">
                  What do you intend to do with the tool?
                </label>
                <textarea
                  value={formData.intent}
                  onChange={(e) => setFormData({ ...formData, intent: e.target.value })}
                  placeholder="Tell us about your use case..."
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all resize-none"
                />
              </div>

              {/* Telegram */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2 text-left">
                  Telegram Username
                </label>
                <input
                  type="text"
                  value={formData.telegramUsername}
                  onChange={(e) => setFormData({ ...formData, telegramUsername: e.target.value })}
                  placeholder="@yourusername"
                  className="w-full px-4 py-3 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent transition-all"
                />
              </div>

              {/* Immediate Start Checkbox */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="immediateStart"
                  checked={formData.wantsImmediateStart}
                  onChange={(e) => setFormData({ ...formData, wantsImmediateStart: e.target.checked })}
                  className="mt-1 w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-white focus:ring-white/20 focus:ring-offset-0"
                />
                <label htmlFor="immediateStart" className="text-sm text-zinc-400 text-left">
                  Check this box if you want to get started now. We&apos;ll share a Telegram link so you can contact us faster.
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  'Submit Request'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Login Link */}
        <div
          className={`mt-12 transition-all duration-1000 delay-900 ${
            mounted ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Link
            href="/login"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Already have access? <span className="underline">Sign in</span>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-6 left-0 right-0 text-center text-xs text-zinc-600">
        <a href="#" className="hover:text-zinc-400 transition-colors">PRIVACY POLICY</a>
        <span className="mx-2">|</span>
        <a href="#" className="hover:text-zinc-400 transition-colors">TERMS OF SERVICE</a>
      </footer>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes draw-circle {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes draw-ellipse {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes arrow-bounce {
          0%, 100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(4px);
          }
        }
        .animate-draw-circle {
          animation: draw-circle 1.5s ease-out forwards;
          animation-delay: 0.2s;
        }
        .animate-draw-ellipse-h {
          animation: draw-ellipse 1.2s ease-out forwards;
          animation-delay: 0.5s;
        }
        .animate-draw-ellipse-v {
          animation: draw-ellipse 1.2s ease-out forwards;
          animation-delay: 0.7s;
        }
        .animate-draw-lat {
          animation: draw-ellipse 1s ease-out forwards;
          animation-delay: 0.9s;
        }
        .animate-draw-lat-2 {
          animation: draw-ellipse 1s ease-out forwards;
          animation-delay: 1.1s;
        }
        .animate-arrow-bounce {
          animation: arrow-bounce 1.5s ease-in-out infinite;
        }
        .animate-globe-materialize {
          animation: globe-materialize 0.8s ease-out forwards;
        }
        @keyframes globe-materialize {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
