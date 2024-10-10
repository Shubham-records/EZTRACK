import React from "react";
import WebappMain from "@/webapp/webappmain";
import WebsiteMain from "@/website/websitemain";
import WebsiteAbout from "@/website/websiteabout";

import {Loginform, Signupform, ForgotPassword} from "@/website/loginSignupform";
import ProtectedRoute from "@/ProtectedRoute";

import { HashRouter, Route, Routes } from "react-router-dom";
import "@/index.css";


export default function App() {
  
  

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<><WebsiteMain/></>}/>
        <Route path="/about" element={<><WebsiteAbout/></>}/>
        <Route path="/webapp" element={<ProtectedRoute><WebappMain/></ProtectedRoute>}/>
        <Route path="/login" element={<><Loginform/></>}/>
        <Route path="/Signup" element={<><Signupform/></>}/>
        <Route path="/forgotpassword" element={<><ForgotPassword/></>}/>
      </Routes>
    </HashRouter>
  )
}

