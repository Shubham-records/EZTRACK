"use client";
import React from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";

export default function WebsiteMain() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-teal-500/30">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <span className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-black">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            <span>EZTRACK</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <Link href="#" className="hover:text-white transition-colors">Features</Link>
            <Link href="#" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="#" className="hover:text-white transition-colors">Resources</Link>
            <Link href="#" className="hover:text-white transition-colors">Company</Link>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium hover:text-white text-zinc-400 transition-colors">
              Log In
            </Link>
            <Link href="/Signup" className="px-5 py-2.5 bg-white text-black text-sm font-bold rounded-full hover:bg-zinc-200 transition-colors">
              Sign Up
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden text-zinc-400 hover:text-white" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#050505] p-6 space-y-4">
            <Link href="#" className="block text-zinc-400 hover:text-white">Features</Link>
            <Link href="#" className="block text-zinc-400 hover:text-white">Pricing</Link>
            <Link href="/login" className="block text-zinc-400 hover:text-white">Log In</Link>
            <Link href="/Signup" className="block w-full text-center px-5 py-3 bg-white text-black font-bold rounded-lg">Sign Up</Link>
          </div>
        )}
      </header>

      <main className="pt-32 pb-24 overflow-hidden">
        {/* Hero Section */}
        <section className="relative max-w-7xl mx-auto px-6 text-center">

          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-teal-400 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
            <span>v2.0 is now live</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent max-w-5xl mx-auto leading-[1.1]">
            Next-Gen Software for <br className="hidden md:block" />
            <span className="text-white">Modern Gym Management</span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Streamline your operations, boost member retention, and scale effortlessly with our AI-powered platform designed for fitness centers.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link href="/Signup" className="px-8 py-4 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-full transition-all hover:scale-105 flex items-center gap-2 group">
              Get Started Free
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <button className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-full transition-all">
              Book Demo
            </button>
          </div>

          {/* 3D Dashboard Image */}
          <div className="relative mx-auto max-w-6xl perspective-[2000px] group">
            {/* Glow Effect */}
            <div className="absolute -inset-10 bg-teal-500/20 blur-[100px] rounded-[50%] opacity-0 group-hover:opacity-30 transition-opacity duration-1000"></div>

            <div className="relative transform transition-transform duration-700 hover:rotate-x-0 hover:rotate-y-0 rotate-x-12 scale-90 border border-white/10 rounded-xl overflow-hidden shadow-2xl bg-[#0a0a0a]">
              <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none z-10"></div>
              <img
                src="/assets/dashboard-hero.jpg"
                alt="EZTRACK Dashboard"
                className="w-full h-auto rounded-xl opacity-90 hover:opacity-100 transition-opacity"
              />
              {/* Reflection/Sheen */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}