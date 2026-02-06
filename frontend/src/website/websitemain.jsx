import React from "react";
import WebsiteHeader from "./websiteHeader";
import Link from "next/link";

export default function WebsiteMain() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark font-body flex flex-col">
      <WebsiteHeader />
      <main className="flex-1 flex flex-col justify-center items-center text-center p-8 lg:p-24 bg-gradient-to-br from-background-light to-zinc-100 dark:from-background-dark dark:to-zinc-900">
        <h1 className="text-4xl md:text-6xl font-extrabold text-zinc-900 dark:text-white mb-6 leading-tight max-w-4xl tracking-tight">
          Revolutionize Your Business with <span className="text-primary">Cutting-Edge SaaS Solutions</span>
        </h1>
        <p className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 mb-10 max-w-2xl">
          Harness the Power of Our Web App to Effortlessly Manage Your Gym with our Gym Management Software
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/Signup" className="px-8 py-4 bg-primary hover:bg-teal-700 text-white font-bold rounded-full shadow-lg hover:shadow-primary/50 transition-all transform hover:-translate-y-1">
            Get Started
          </Link>
          <button className="px-8 py-4 bg-white dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white font-bold rounded-full hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all">
            Learn More
          </button>
        </div>
      </main>
    </div>
  );
}