import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import img from "@/assets/img.png";
import axios from "axios";

export function Signupform() {
  const [GYMNAME, setGYMNAME] = useState("");
  const [EMAILID, setEMAILID] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  async function handleSignup(event) {
    event.preventDefault();
    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/signupcheck",
        { username, password, GYMNAME, EMAILID },
        { responseType: "text" }
      );

      alert(response.data);
      navigate("/login");
    } catch (err) {
      console.error(err);

      if (err.response && err.response.data) {
        alert(err.response.data);
      } else {
        alert("Signup failed.");
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
        <img src={img} />
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
        <Link to="/">{"< Home"}</Link>

        <div style={{ padding: "4rem" }}>
          <div className="form-container">
            <p className="title">Sign Up</p>
            <form className="form" onSubmit={handleSignup}>
              <div className="input-group">
                <label for="username">GYM NAME</label>
                <input
                  type="text"
                  required
                  value={GYMNAME}
                  onChange={(event) => setGYMNAME(event.target.value)}
                />
              </div>
              <div className="input-group">
                <label for="username">EMAIL ID</label>
                <input
                  type="email"
                  required
                  value={EMAILID}
                  onChange={(event) => setEMAILID(event.target.value)}
                />
              </div>
              <div className="input-group">
                <label for="username">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="input-group">
                <label for="password">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <br />
              <button type="submit" className="sign">
                Sign Up
              </button>
            </form>
            <br />
            <p className="signup">
              Already have an account?
              <Link to="/login" >
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
  const navigate = useNavigate();

  async function handlelogin(event) {
    event.preventDefault();

    try {
      const response = await axios.post(
        "http://127.0.0.1:5000/logincheck",
        { username, password },
        { responseType: "json" }
      );
      alert(response.data.message);

      if (response.status === 200) {
        const { access_token } = response.data;
        const { databaseName } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('databaseName', databaseName);

        navigate("/webapp");
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err.response && err.response.data) {
        alert(err.response.data.message);
      } else {
        alert("Login failed.");
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
        <img src={img} />
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
      <Link to="/">{"< Home"}</Link>


        <div style={{padding: "4rem",}}>
        <div className="form-container">
          <p className="title">Login</p>
          <form className="form" onSubmit={handlelogin}>
            <div className="input-group">
              <label for="username">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="input-group">
              <label for="password">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <div className="forgot">
                <Link to="/forgotpassword">Forgot Password ?</Link>
              </div>
            </div>
            <button type="submit" className="sign">
              Login
            </button>
          </form>
          <br />
          <p className="signup">
            Don't have an account?
            <Link to="/Signup" >
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
  const navigate = useNavigate();

  const handleRequestOtp = async (event) => {
    event.preventDefault();

    try {
      const response = await axios.post("http://127.0.0.1:5000/request_otp", {
        email,
      });

      alert(response.data.message);

      setShowOtpInput(true);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        alert(err.response.data.message); // Display error message from the backend
      } else {
        alert("Error requesting OTP.");
      }
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();

    try {
      const response = await axios.post("http://127.0.0.1:5000/verify_otp", {
        email,
        otp,
      });

      alert(response.data.message); 

      setShowOtpInput(false);
      setShowPasswordInputs(true);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        alert(err.response.data.message); 
      } else {
        alert("Error verifying OTP.");
      }
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      alert("Passwords do not match. Please try again.");
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

      alert(response.data.message);

      navigate("/login");
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data) {
        alert(err.response.data.message);
      } else {
        alert("Error resetting password.");
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
        <img src={img} />
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
        <Link to="/">{"< Home"}</Link>

        <div style={{ padding: "4rem" }}>
        {showOtpInput ? (
            <form className="form" style={{width:"30vw"}} onSubmit={handleVerifyOtp}>
            <div className="input-group">
              <label>Enter OTP</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
            <br/>
            <button className="sign" type="submit">Check OTP</button>
            </form>
        ) : showPasswordInputs ? (
          <form className="form" style={{width:"30vw"}} onSubmit={handleResetPassword}>
            <div className="input-group">
                <label>Password</label>
                <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                />
            </div>
            <br/>
            <div className="input-group">
                <label>Re-Enter Password</label>
                <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                
                />
            </div>
            <br/>
            <button className="sign" type="submit">Reset Password</button>
          </form>
        ) : (
          <form className="form" style={{width:"30vw"}} onSubmit={handleRequestOtp}>
            <div className="input-group">
              <label>Enter Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <br/>
            <button className="sign" type="submit">Send OTP</button>
          </form>
        )}
        <br/>
        <p className="signup">
            <Link to="/Signup" >
              Sign up
            </Link>
            <span> OR </span>
            <Link to="/login">
              Login
            </Link>
          </p>
          </div>
      </div>
    </section>
  );
}
