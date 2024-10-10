import React from "react";
import { Link } from "react-router-dom";
export default function WebsiteHeader() {
  return (
    <>
      <header className="navbar">
        <div className="navbarLogo">EZTRACK</div>
        <nav className="navbarLinks">
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
        <span style={{gap: '10px', display: "flex"}}>
          <button className="getStartedButton"><Link to="/login">LOGIN</Link></button>
        </span>
      </header>
    </>
  );
}
