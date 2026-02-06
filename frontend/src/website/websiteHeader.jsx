import React from "react";
import Link from "next/link";

export default function WebsiteHeader() {
  return (
    <>
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur border-b border-zinc-200 dark:border-zinc-800">
        <div className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
          <span className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          </span>
          EZTRACK
        </div>
        <nav className="hidden md:flex items-center space-x-8">
          <Link href="/" className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-primary transition-colors">Home</Link>
          <Link href="/about" className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-primary transition-colors">About</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/login" className="px-5 py-2.5 bg-primary hover:bg-teal-700 text-white text-sm font-bold rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
            LOGIN
          </Link>
        </div>
      </header>
    </>
  );
}
