import React, { useState, useContext } from "react";
import { ThemeContext } from './webappmain';
import {NewAdmission, ReAdmission, PerDayBasis,Renewal, ReturnMembership} from "./forms"
export default function Billing() {
  const { theme } = useContext(ThemeContext);

  const [selectedPage, setSelectedPage] = useState("");
  function handlenavbarClick(page) {
    setSelectedPage(page);
  }
  return (
    <section className={`Billing ${theme === 'dark' ? 'primary-bg primary-text' : 'secondary-bg secondary-text'}`}>
      <div className="wrapper">
        <div className={`option ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} onClick={() => handlenavbarClick("NewAdmission")}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">NewAdmission</div>
        </div>
        <div className={`option ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} onClick={() => handlenavbarClick("ReAdmission")}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">ReAdmission</div>
        </div>
        <div className={`option ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} onClick={() => handlenavbarClick("PerDayBasis")}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">PerDayBasis</div>
        </div>
        <div className={`option ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} onClick={() => handlenavbarClick("Renewal")}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">Renewal</div>
        </div>
        <div className={`option ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} onClick={() => handlenavbarClick("Protein")}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">Protein</div>
        </div>
        <div className={`option ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} onClick={() => handlenavbarClick("ReturnMembership")}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">ReturnMembership</div>
        </div>
        <div className={`option ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} onClick={() => handlenavbarClick("ReturnProtein")}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">ReturnProtein</div>
        </div>
        <div className={`option ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} onClick={() => handlenavbarClick("Expenses")}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">Expenses</div>
        </div>
      </div>
      <div className="billingcontainer" style={{padding:"3vw 0"}}>
          {selectedPage === "NewAdmission" && <NewAdmission/>}
          {selectedPage === "ReAdmission" && <ReAdmission/>}
          {selectedPage === "Renewal" && <Renewal/>}
          {selectedPage === "Protein" && <></>}
          {selectedPage === "ReturnMembership" && <ReturnMembership/>}
          {selectedPage === "ReturnProtein" && <></>}
          {selectedPage === "Expenses" && <></>}
          {selectedPage === "PerDayBasis" && <PerDayBasis/>}
      </div>
    </section>
  );
}
