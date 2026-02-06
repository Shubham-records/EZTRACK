import React, { useState } from 'react'

export default function ExpriesOverdue() {
    const [display, setdisplay] = useState("EX");

    return (
        <div className="w-full">
            <div className="flex border-b border-zinc-200 dark:border-zinc-800 mb-4">
                <button
                    onClick={() => setdisplay("EX")}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${display === "EX"
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    Membership Expiries
                </button>
                <button
                    onClick={() => setdisplay("OV")}
                    className={`flex-1 py-3 text-sm font-semibold transition-colors ${display === "OV"
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                >
                    Membership Overdues
                </button>
            </div>
            <div className="flex items-center justify-center h-60 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">
                    {display === "EX" ? 'No Expiries This Month' : 'No Overdues'}
                </p>
            </div>
        </div>
    )
}
