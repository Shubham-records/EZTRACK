import React from 'react'

export default function DashboardCards({Value,ValueName}) {

    return (
            <div className='DashboardCards' id='boxDiv'>
                <h1>{Value}</h1>
                <br/>
                <p style={{fontWeight:"bold"}}>{ValueName}</p>
            </div>
    )
}
