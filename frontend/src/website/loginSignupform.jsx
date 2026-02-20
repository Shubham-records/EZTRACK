"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import img from "@/assets/img.png";
import axios from "axios";
import { useToast } from "@/context/ToastContext";

export function Signupform() {
  const [GYMNAME, setGYMNAME] = useState("");
  const [EMAILID, setEMAILID] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const { showToast } = useToast();

  async function handleSignup(event) {
    event.preventDefault();
    try {
      const response = await axios.post(
        "/api/auth/signup",
        { username, password, GYMNAME, EMAILID }
      );

      showToast(response.data, 'success');
      router.push("/login");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        showToast(err.response.data.detail || "Signup failed.", 'error');
      } else {
        showToast("Signup failed.", 'error');
      }
    }
  }

  return (
    <section className="flex min-h-screen bg-background-light dark:bg-background-dark font-body">
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center relative overflow-hidden bg-gradient-to-br from-primary to-teal-800 p-8">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-white/15 rounded-full blur-2xl"></div>

        <h1 className="text-6xl font-extrabold text-white text-center mb-8 tracking-tight drop-shadow-md z-10">
          Elevate Your Gym
        </h1>
        <div className="w-full max-w-md relative z-10 drop-shadow-2xl">
          <Image src={img} alt="Illustration" layout="responsive" />
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-surface-light dark:bg-surface-dark">
        <div className="w-full max-w-md">
          <Link href="/" className="text-zinc-500 hover:text-primary transition-colors mb-8 flex items-center gap-2 font-medium">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            Back to Home
          </Link>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-soft">
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Create Account</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8">Join the EZTRACK community today</p>

            <form onSubmit={handleSignup} className="flex flex-col gap-5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">GYM NAME</label>
                <input
                  type="text"
                  required
                  placeholder="The Iron Temple"
                  value={GYMNAME}
                  onChange={(event) => setGYMNAME(event.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">EMAIL ADDRESS</label>
                <input
                  type="email"
                  required
                  placeholder="contact@gym.com"
                  value={EMAILID}
                  onChange={(event) => setEMAILID(event.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">USERNAME</label>
                <input
                  type="text"
                  required
                  placeholder="admin_iron"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">PASSWORD</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>

              <button type="submit" className="w-full py-3.5 rounded-lg border-none bg-gradient-to-r from-primary to-teal-700 text-white font-bold text-base cursor-pointer shadow-lg shadow-primary/30 hover:shadow-primary/50 transform hover:-translate-y-0.5 transition-all mt-4">
                Start Free Trial
              </button>
            </form>

            <p className="text-center mt-8 text-zinc-500 text-sm">
              Already registered? {' '}
              <Link href="/login" className="text-primary font-bold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Loginform() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const { showToast } = useToast();

  async function handlelogin(event) {
    event.preventDefault();
    try {
      const response = await axios.post(
        "/api/auth/login",
        { username, password }
      );

      showToast(response.data.message, 'success');

      if (response.status === 200) {
        const { eztracker_jwt_access_control_token, eztracker_jwt_databaseName_control_token } = response.data;
        localStorage.setItem('eztracker_jwt_access_control_token', eztracker_jwt_access_control_token);
        localStorage.setItem('eztracker_jwt_databaseName_control_token', eztracker_jwt_databaseName_control_token);

        router.push("/webapp");
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err.response && err.response.data) {
        showToast(err.response.data.detail || "Login failed.", 'error');
      } else {
        showToast("Login failed.", 'error');
      }
    }
  }

  return (
    <section className="flex min-h-screen bg-background-light dark:bg-background-dark font-body">
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center relative overflow-hidden bg-gradient-to-br from-primary to-teal-900 p-8">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-white/5 rounded-full blur-3xl"></div>

        <h1 className="text-6xl font-extrabold text-white text-center mb-8 tracking-tight drop-shadow-md z-10">
          Welcome Back
        </h1>
        <div className="w-full max-w-md relative z-10 drop-shadow-2xl">
          <Image src={img} alt="Illustration" layout="responsive" />
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-surface-light dark:bg-surface-dark">
        <div className="w-full max-w-md">
          <Link href="/" className="text-zinc-500 hover:text-primary transition-colors mb-8 flex items-center gap-2 font-medium">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            Back to Home
          </Link>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-soft">
            <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Login</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8">Access your gym dashboard</p>

            <form onSubmit={handlelogin} className="flex flex-col gap-5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">USERNAME</label>
                <input
                  type="text"
                  required
                  placeholder="admin"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">PASSWORD</label>
                  <Link href="/forgotpassword" className="text-sm text-primary font-bold hover:underline">Forgot password?</Link>
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>

              <button type="submit" className="w-full py-3.5 rounded-lg border-none bg-gradient-to-r from-primary to-teal-700 text-white font-bold text-base cursor-pointer shadow-lg shadow-primary/30 hover:shadow-primary/50 transform hover:-translate-y-0.5 transition-all mt-4">
                Sign In
              </button>
            </form>

            <p className="text-center mt-8 text-zinc-500 text-sm">
              New here? {' '}
              <Link href="/Signup" className="text-primary font-bold hover:underline">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [showPasswordInputs, setShowPasswordInputs] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const router = useRouter();
  const { showToast } = useToast();

  const handleRequestOtp = async (event) => {
    event.preventDefault();

    try {
      const response = await axios.post("http://127.0.0.1:5000/request_otp", {
        email,
      });

      showToast(response.data.message, 'success');
      setShowOtpInput(true);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        showToast(err.response.data.message, 'error');
      } else {
        showToast("Error requesting OTP.", 'error');
      }
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();

    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/verify_otp",
        {
          email,
          otp,
        }
      );

      showToast(response.data.message, 'success');
      setShowPasswordInputs(true);
      setShowOtpInput(false);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        showToast(err.response.data.message, 'error');
      } else {
        showToast("Error verifying OTP.", 'error');
      }
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      showToast("Passwords do not match. Please try again.", 'error');
      return;
    }

    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/reset_password",
        {
          email,
          password,
        }
      );

      showToast(response.data.message, 'success');

      router.push("/login");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        showToast(err.response.data.message, 'error');
      } else {
        showToast("Error resetting password.", 'error');
      }
    }
  };

  return (
    <section className="flex min-h-screen bg-background-light dark:bg-background-dark font-body">
      <div className="hidden lg:flex flex-1 flex-col justify-center items-center bg-gradient-to-br from-primary to-teal-900 p-8 text-white">
        <h1 className="text-5xl font-extrabold mb-8 tracking-tight">Forgot Password?</h1>
        <div className="w-full max-w-md">
          <Image src={img} alt="Background" layout="responsive" />
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-surface-light dark:bg-surface-dark">
        <div className="w-full max-w-md">
          <Link href="/" className="text-zinc-500 hover:text-primary transition-colors mb-8 flex items-center gap-2 font-medium">
            {"< Back to Home"}
          </Link>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-soft">
            {showOtpInput ? (
              <form autoComplete="off" className="flex flex-col gap-5" onSubmit={handleVerifyOtp}>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Enter OTP</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                <button className="w-full py-3.5 rounded-lg border-none bg-primary text-white font-bold cursor-pointer hover:bg-teal-700 transition-all" type="submit">Check OTP</button>
              </form>
            ) : showPasswordInputs ? (
              <form autoComplete="off" className="flex flex-col gap-5" onSubmit={handleResetPassword}>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                <button className="w-full py-3.5 rounded-lg border-none bg-primary text-white font-bold cursor-pointer hover:bg-teal-700 transition-all" type="submit">Reset Password</button>
              </form>
            ) : (
              <form autoComplete="off" autoComplete="off" className="flex flex-col gap-5" onSubmit={handleRequestOtp}>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Enter Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                </div>
                <button className="w-full py-3.5 rounded-lg border-none bg-primary text-white font-bold cursor-pointer hover:bg-teal-700 transition-all" type="submit">Send OTP</button>
              </form>
            )}
            <div className="mt-8 text-center text-sm">
              <Link href="/Signup" className="text-primary font-bold hover:underline mx-2">Sign up</Link>
              <span className="text-zinc-400">|</span>
              <Link href="/login" className="text-primary font-bold hover:underline mx-2">Login</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}