import React from 'react'
import DashboardCards from './dashboardCards'
import ExpriesOverdue from './expriesOverdue'

export default function Dashboard() {

    return (
      <>
      <section className='dashboardMain'>
        <div className='dashboardMainPart1'>
            <DashboardCards Value={0} ValueName={"Last Month Active Members"}/>
            <DashboardCards Value={0} ValueName={"Today Plan Expiry"}/>
            <DashboardCards Value={0} ValueName={"Today Collection"}/>
            <DashboardCards Value={0} ValueName={"Week Collection"}/>
            <DashboardCards Value={0} ValueName={"Pending Balance"}/>
            <DashboardCards Value={0} ValueName={"Today Renewal"}/>
            <DashboardCards Value={0} ValueName={"Last Month Month Renewal"}/>
            <DashboardCards Value={0} ValueName={"Member Present"}/>

        </div>
        <div className='dashboardMainPart2'>
            <div className='CollectionExpense' id='boxDiv'>
              <span style={{display:"flex", borderBottom: "1px solid #202224"}}>
                <h2 style={{backgroundColor: "transparent", flex:1, fontSize:"1rem", padding:"1rem 2rem", color: "#fff", borderTopLeftRadius: "8px"}}>Today Invoices</h2>
              </span>
              <span style={{display:"flex", alignItems:"center", justifyContent: "center", height:"15rem"}}>
                  <p>today no Overdues</p>
                </span>
            </div>
            <ExpriesOverdue />
        </div>
      </section>
      </>
    )
}