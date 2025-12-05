'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';


// Rotating Wireframe Globe Component with true 3D rotation effect
function WireframeGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const rotationRef = useRef(0);
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // High DPI support
    const dpr = window.devicePixelRatio || 1;
    const size = 320;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);
    
    const cx = size / 2;
    const cy = size / 2;
    const radius = 140;
    
    // Tilt angle (like in the reference image - tilted forward)
    const tiltAngle = 23.5 * (Math.PI / 180); // Earth's actual tilt
    
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.2;
    
    // Draw outer circle (sphere outline)
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw latitude lines (horizontal circles when tilted)
    const latitudes = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
    
    for (const lat of latitudes) {
      const latRad = lat * (Math.PI / 180);
      const y = Math.sin(latRad) * radius;
      const r = Math.cos(latRad) * radius;
      
      // Apply tilt transformation
      const tiltedY = y * Math.cos(tiltAngle);
      const tiltedZ = y * Math.sin(tiltAngle);
      
      // Project to 2D (orthographic projection)
      const projectedY = cy - tiltedY;
      const ellipseHeight = Math.abs(r * Math.sin(tiltAngle));
      
      // Adjust opacity based on visibility
      const visibility = Math.cos(latRad);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + visibility * 0.3})`;
      
      ctx.beginPath();
      ctx.ellipse(cx, projectedY, r, ellipseHeight, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    // Draw longitude lines (meridians) - these rotate!
    const meridianCount = 18;
    const rotation = rotationRef.current;
    
    for (let i = 0; i < meridianCount; i++) {
      const baseLon = (i * 180) / meridianCount;
      const lon = (baseLon + rotation) % 360;
      const lonRad = lon * (Math.PI / 180);
      
      // Calculate the apparent width of the ellipse based on longitude
      const apparentWidth = radius * Math.sin(lonRad);
      
      // Determine if this meridian is on the front or back of the globe
      const isBack = Math.cos(lonRad) < 0;
      
      ctx.strokeStyle = isBack 
        ? 'rgba(255, 255, 255, 0.15)' 
        : `rgba(255, 255, 255, ${0.4 + Math.abs(Math.sin(lonRad)) * 0.4})`;
      
      ctx.beginPath();
      
      // Draw meridian as points along the line from pole to pole
      const segments = 60;
      for (let j = 0; j <= segments; j++) {
        const lat = (j / segments) * Math.PI - Math.PI / 2; // -90 to 90 degrees
        
        // 3D coordinates on sphere
        const x3d = radius * Math.cos(lat) * Math.sin(lonRad);
        const y3d = radius * Math.sin(lat);
        const z3d = radius * Math.cos(lat) * Math.cos(lonRad);
        
        // Apply tilt rotation around X axis
        const y3dTilted = y3d * Math.cos(tiltAngle) - z3d * Math.sin(tiltAngle);
        const z3dTilted = y3d * Math.sin(tiltAngle) + z3d * Math.cos(tiltAngle);
        
        // Project to 2D (orthographic)
        const x2d = cx + x3d;
        const y2d = cy - y3dTilted;
        
        if (j === 0) {
          ctx.moveTo(x2d, y2d);
        } else {
          ctx.lineTo(x2d, y2d);
        }
      }
      ctx.stroke();
    }
    
    // Update rotation
    rotationRef.current = (rotation + 0.3) % 360;
    
    // Continue animation
    animationRef.current = requestAnimationFrame(draw);
  }, []);
  
  useEffect(() => {
    draw();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <div className="globe-container">
      <canvas
        ref={canvasRef}
        className="globe-canvas"
      />
      <style jsx>{`
        .globe-container {
          width: 320px;
          height: 320px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .globe-canvas {
          width: 320px;
          height: 320px;
        }
      `}</style>
    </div>
  );
}

export default function LandingPage() {
  const [showForm, setShowForm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [headlineRedacted, setHeadlineRedacted] = useState('');
  const [headlineTypingComplete, setHeadlineTypingComplete] = useState(false);
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

  // Typing animation for "[Redacted]" in headline - only on load
  useEffect(() => {
    if (!mounted || headlineTypingComplete) return;
    
    const targetText = '[Redacted]';
    
    if (headlineRedacted.length < targetText.length) {
      const timeout = setTimeout(() => {
        setHeadlineRedacted(targetText.slice(0, headlineRedacted.length + 1));
      }, 100);
      return () => clearTimeout(timeout);
    } else {
      setHeadlineTypingComplete(true);
    }
  }, [mounted, headlineRedacted, headlineTypingComplete]);

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
      <main className="relative z-10 flex flex-col items-center justify-center px-6 py-12 text-center max-w-5xl mx-auto">
        {/* Rotating Wireframe Globe */}
        <div className={`mb-8 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <WireframeGlobe />
        </div>

        {/* Small text above headline */}
        <p
          className={`text-sm md:text-base text-zinc-500 uppercase tracking-widest mb-4 transition-all duration-1000 delay-200 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          Scrape Unlimited Leads From{' '}
          <span className="text-zinc-300 font-medium">
            {headlineRedacted}
            {!headlineTypingComplete && <span className="animate-pulse">|</span>}
          </span>
        </p>

        {/* Headline */}
        <h1
          className={`text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 transition-all duration-1000 delay-300 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: '-0.02em' }}
        >
          <span className="text-white">[Redacted]</span>&apos;s database contains over{' '}
          <span className="text-zinc-400">210M contacts</span>,{' '}
          <span className="text-zinc-400">144M phone numbers</span>, and{' '}
          <span className="text-zinc-400">35M global companies</span>.{' '}
          Find and Enrich With Your Own Custom-Built Scraper.
        </h1>

        {/* Subheadline */}
        <p
          className={`text-xl md:text-2xl text-zinc-300 font-medium mb-12 transition-all duration-1000 delay-500 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          Custom Built For You
        </p>

        {/* Features Section */}
        <div
          className={`grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 w-full max-w-4xl transition-all duration-1000 delay-700 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-6">
            <div className="text-3xl font-bold text-white mb-2">248M</div>
            <div className="text-sm text-zinc-400">Contacts</div>
          </div>
          
          <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-6">
            <div className="text-xl font-semibold text-white mb-2">Undetectable</div>
            <div className="text-sm text-zinc-400">Masking, FingerPrinted Setup,</div>
            <div className="text-sm text-zinc-400">and Custom Built For You.</div>
          </div>
          
          <div className="bg-zinc-900/40 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-6">
            <div className="text-xl font-semibold text-white mb-2">Email Verifier</div>
            <div className="text-sm text-zinc-400">Only pay for enrichment</div>
            <div className="text-xs text-zinc-500 mt-1">If the lead is valid</div>
          </div>
        </div>

        {/* Requirements Section */}
        <div
          className={`mb-12 transition-all duration-1000 delay-750 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <p className="text-sm text-zinc-500 uppercase tracking-widest mb-2">Requirements</p>
          <p className="text-lg text-zinc-300">1 Apollo Account</p>
        </div>

        {/* Request Access Button */}
        <div
          className={`transition-all duration-1000 delay-800 ${
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
              {formData.wantsImmediateStart && process.env.NEXT_PUBLIC_TELEGRAM_LINK && (
                <p className="text-zinc-400 mt-4">
                  Want to chat now? Join our{' '}
                  <a
                    href={process.env.NEXT_PUBLIC_TELEGRAM_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-zinc-300 underline"
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
        @keyframes arrow-bounce {
          0%, 100% {
            transform: translateX(0);
          }
          50% {
            transform: translateX(4px);
          }
        }
        .animate-arrow-bounce {
          animation: arrow-bounce 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
