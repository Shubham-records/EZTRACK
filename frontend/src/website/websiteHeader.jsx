import React from "react";
import Link from "next/link";
export default function WebsiteHeader() {
  return (
    <>
      <header className="navbar" style={{ backgroundColor: "#ffffff" }}>
        <div className="navbarLogo" style={{ color: "#000" }}>EZTRACK</div>
        <nav className="navbarLinks">
          <a href="/">Home</a>
          <a href="/about">About</a>
        </nav>
        <span style={{ gap: '10px', display: "flex" }}>
          <button className="getStartedButton"><Link href="/login">LOGIN</Link></button>
        </span>
      </header>
    </>
  );
}
