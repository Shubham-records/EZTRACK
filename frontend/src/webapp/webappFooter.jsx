import React, { useContext } from 'react';
import { ThemeContext } from './webappmain';

export default function WebappFooter() {
  const { theme } = useContext(ThemeContext);
  
  return (
    <footer className={`footer ${theme === 'dark' ? 'primary-bg primary-text' : 'secondary-bg secondary-text'}`}>
      copyright @ shubham
    </footer>
  );
}
