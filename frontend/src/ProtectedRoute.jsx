import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const accessToken = localStorage.getItem('access_token');
  
  if (!accessToken) {
    return <Navigate to="/login" />;
  }

  return children;
};

export default ProtectedRoute;
