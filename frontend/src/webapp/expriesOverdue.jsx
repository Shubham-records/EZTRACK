import React, { useState } from 'react'

export default function ExpriesOverdue() {

    const [display,setdisplay]=useState("EX");
    function handleClick(data){
        setdisplay(data);
    }
    
    return (
        <div className="expriesOverdue" id='boxDiv'>
            <span style={{display:"flex", borderBottom: "1px solid #202224"}}>
  
                <h2 onClick={()=>{handleClick("EX")}} style={{backgroundColor: display === "EX"? "transparent":"black", flex:1, fontSize:"1rem", padding:"1rem 2rem", color: "#fff", borderTopLeftRadius: "8px"}}>Membership expiries</h2>
                <h2 onClick={()=>{handleClick("OV")}} style={{backgroundColor: display === "OV"? "transparent":"black", flex:1, fontSize:"1rem", padding:"1rem 2rem", color: "#fff", borderTopRightRadius: "8px"}}>Membership overdues</h2>
            </span>
            <span style={{display:"flex", alignItems:"center", justifyContent: "center",height:"15rem"}}>
                {display === "EX"? <p>No Expiries This Month</p>: <p>NO Overdues</p>}
            </span>
        
        </div>
    )
  }
