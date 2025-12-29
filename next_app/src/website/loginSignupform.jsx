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
        { username, password, GYMNAME, EMAILID },
        { responseType: "text" }
      );

      showToast(response.data, 'success');
      router.push("/login");
    } catch (err) {
      console.error(err);

      if (err.response && err.response.data) {
        showToast(err.response.data, 'error');
      } else {
        showToast("Signup failed.", 'error');
      }
    }
  }

  return (
    <section className="login">
      <div
        style={{
          flex: 1,
          background:
            "linear-gradient(rgba(140,67,230,1), rgba(239,141,109,1))",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: "3rem", fontFamily: "cursive" }}>Hey There!</h1>
        <Image src={img} alt="Background" />
      </div>
      <div
        style={{
          display: "grid",
          flex: 1,
          padding: "1rem",
          justifyContent: "center",
          backgroundColor: "#111827", // Tailwind gray-900
          color: "white"
        }}
      >
        <Link href="/" style={{ color: '#60a5fa', marginBottom: '1rem' }}>{"< Home"}</Link>

        <div style={{ padding: "4rem" }}>
          <div className="form-container">
            <p className="title">Sign Up</p>
            <form className="form" onSubmit={handleSignup}>
              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="gymname" style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>GYM NAME</label>
                <input
                  type="text"
                  required
                  value={GYMNAME}
                  onChange={(event) => setGYMNAME(event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: 'none' }}
                />
              </div>
              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="email" style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>EMAIL ID</label>
                <input
                  type="email"
                  required
                  value={EMAILID}
                  onChange={(event) => setEMAILID(event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: 'none' }}
                />
              </div>
              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="username" style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: 'none' }}
                />
              </div>

              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: 'none' }}
                />
              </div>
              <br />
              <button type="submit" className="sign" style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: 'linear-gradient(to right, #8b5cf6, #ec4899)',
                color: 'white',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginTop: '1rem'
              }}>
                Sign Up
              </button>
            </form>
            <br />
            <p className="signup" style={{ textAlign: 'center', marginTop: '1rem', color: '#9ca3af' }}>
              Already have an account?{' '}
              <Link href="/login" style={{ color: '#60a5fa' }}>
                Login
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
        { username, password },
        { responseType: "json" }
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
        showToast(err.response.data.message, 'error');
      } else {
        showToast("Login failed.", 'error');
      }
    }
  }

  return (
    <section className="login">
      <div
        style={{
          flex: 1,
          background:
            "linear-gradient(rgba(140,67,230,1), rgba(239,141,109,1))",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: "3rem", fontFamily: "cursive" }}>
          {" "}
          Welcome Back!
        </h1>
        <Image src={img} alt="Background" />
      </div>

      <div
        style={{
          display: "grid",
          flex: 1,
          padding: "1rem",
          justifyContent: "center",
          backgroundColor: "rgba(17, 24, 39, 1)",
        }}
      >
        <Link href="/" style={{ color: '#60a5fa', marginBottom: '1rem' }}>{"< Home"}</Link>


        <div style={{ padding: "4rem", }}>
          <div className="form-container">
            <p className="title" style={{ color: '#e5e7eb' }}>Login</p>
            <form className="form" onSubmit={handlelogin}>
              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="username" style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: 'none' }}
                />
              </div>
              <div className="input-group" style={{ marginBottom: '1rem' }}>
                <label htmlFor="password" style={{ display: 'block', marginBottom: '0.5rem', color: '#e5e7eb' }}>Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: 'none' }}
                />
                <div className="forgot" style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                  <Link href="/forgotpassword" style={{ color: '#60a5fa', fontSize: '0.875rem' }}>Forgot Password ?</Link>
                </div>
              </div>
              <button type="submit" className="sign" style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: 'linear-gradient(to right, #8b5cf6, #ec4899)',
                color: 'white',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginTop: '1rem'
              }}>
                Login
              </button>
            </form>
            <br />
            <p className="signup" style={{ textAlign: 'center', marginTop: '1rem', color: '#9ca3af' }}>
              Don't have an account?{' '}
              <Link href="/Signup" style={{ color: '#60a5fa' }}>
                Sign up
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
    <section className="login">
      <div
        style={{
          flex: 1,
          background:
            "linear-gradient(rgba(140,67,230,1), rgba(239,141,109,1))",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: "3rem", fontFamily: "cursive" }}>
          Huh Forgot Password!
        </h1>
        <Image src={img} alt="Background" />
      </div>
      <div
        style={{
          display: "grid",
          flex: 1,
          padding: "1rem",
          justifyContent: "center",
          backgroundColor: "rgba(17, 24, 39, 1)",
        }}
      >
        <Link href="/" style={{ color: '#60a5fa', marginBottom: '1rem' }}>{"< Home"}</Link>

        <div style={{ padding: "4rem" }}>
          {showOtpInput ? (
            <form className="form" style={{ width: "30vw" }} onSubmit={handleVerifyOtp}>
              <div className="input-group">
                <label>Enter OTP</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </div>
              <br />
              <button className="sign" type="submit">Check OTP</button>
            </form>
          ) : showPasswordInputs ? (
            <form className="form" style={{ width: "30vw" }} onSubmit={handleResetPassword}>
              <div className="input-group">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <br />
              <div className="input-group">
                <label>Re-Enter Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}

                />
              </div>
              <br />
              <button className="sign" type="submit">Reset Password</button>
            </form>
          ) : (
            <form className="form" style={{ width: "30vw" }} onSubmit={handleRequestOtp}>
              <div className="input-group">
                <label>Enter Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <br />
              <button className="sign" type="submit">Send OTP</button>
            </form>
          )}
          <br />
          <p className="signup">
            <Link href="/Signup" >
              Sign up
            </Link>
            <span> OR </span>
            <Link href="/login">
              Login
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}