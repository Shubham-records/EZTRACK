import React, { useState, useContext } from 'react'
import { ThemeContext } from './webappmain'

export default function ExpriesOverdue() {
    const { theme } = useContext(ThemeContext);
    const [display, setdisplay] = useState("EX");

    return (
        <div className={`expriesOverdue ${theme === 'dark' ? 'primary-card-bg' : 'secondary-card-bg'}`} id='boxDiv'>
            <span style={{
                display: "flex",
                borderBottom: `1px solid ${theme === 'dark' ? 'var(--primary-border-color)' : 'var(--secondary-border-color)'}`
            }}>
                <h2
                    onClick={() => setdisplay("EX")}
                    className={`flex-1 text-base p-4 rounded-tl cursor-pointer ${display === "EX"
                            ? theme === 'dark' ? 'primary-text' : 'secondary-text'
                            : theme === 'dark' ? 'primary-bg' : 'secondary-bg'
                        }`}
                >
                    Membership expiries
                </h2>
                <h2
                    onClick={() => setdisplay("OV")}
                    className={`flex-1 text-base p-4 rounded-tr cursor-pointer ${display === "OV"
                            ? theme === 'dark' ? 'primary-text' : 'secondary-text'
                            : theme === 'dark' ? 'primary-bg' : 'secondary-bg'
                        }`}
                >
                    Membership overdues
                </h2>
            </span>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "15rem" }}>
                {display === "EX" ? <p>No Expiries This Month</p> : <p>NO Overdues</p>}
            </span>

        </div>
    )
}
