import React, { useState }  from "react";
import {NewAdmission, ReAdmission, PerDayBasis,Renewal, ReturnMembership} from "./forms"
export default function Billing() {

  const [selectedPage, setSelectedPage] = useState("");
  function handlenavbarClick(page) {
    setSelectedPage(page);
  }
  return (
    <section
      className="Billing"
      style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <div className="wrapper">
        <div className="option" onClick={()=>{handlenavbarClick("NewAdmission")}}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">NewAdmission</div>
        </div>
        <div className="option" onClick={()=>{handlenavbarClick("ReAdmission")}}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">ReAdmission</div>
        </div>
        <div className="option" onClick={()=>{handlenavbarClick("PerDayBasis")}}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">PerDayBasis</div>
        </div>
        <div className="option" onClick={()=>{handlenavbarClick("Renewal")}}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">Renewal</div>
        </div>
        <div className="option" onClick={()=>{handlenavbarClick("Protein")}}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">Protein</div>
        </div>
        <div className="option" onClick={()=>{handlenavbarClick("ReturnMembership")}}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">ReturnMembership</div>
        </div>
        <div className="option" onClick={()=>{handlenavbarClick("ReturnProtein")}}>
          <input name="btn" type="radio" className="input" />
          <div className="btnName">ReturnProtein</div>
        </div>
        <div className="option" onClick={()=>{handlenavbarClick("Expenses")}}>
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
