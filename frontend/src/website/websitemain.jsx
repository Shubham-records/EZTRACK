import React from "react";
import WebsiteHeader from "./websiteHeader";
import { Link } from "react-router-dom";

export default function WebsiteMain() {
  return (
    <div style={{height:"100%", backgroundColor:"black"}}>
      <WebsiteHeader />
      <main className="heroSection">
        <h1 className="heroTitle">
          Revolutionize Your Business with Cutting-Edge SaaS Solutions:
        </h1>
        <p className="heroSubtitle">
          Harness the Power of Our Web App to Effortlessly Manage Your Gym with our Gym Management Software
        </p>
        <div className="heroButtons">
          <button className="getStartedButton"><Link to="/Signup">Get Started</Link></button>
          <button className="learnMoreButton">Learn More</button>
        </div>
      </main>
    </div>
  );
}