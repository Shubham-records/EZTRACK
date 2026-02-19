
import React from 'react';

export default function SearchResults({ results, category, onRedirect, onBack }) {
    if (!results || results.length === 0) return null;

    return (
        <div className="p-6">
            <div className="mb-6 flex items-center gap-4">
                <button onClick={onBack} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Search Results</h2>
                    <p className="text-zinc-500">Found {results.length} results in {category}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((item, idx) => (
                    <div key={idx} className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all">
                        <div className="flex justify-between items-start mb-2">
                            <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full font-bold uppercase">{category}</span>
                            <button
                                onClick={() => onRedirect(item, category)}
                                className="text-sm text-primary hover:underline flex items-center gap-1"
                            >
                                Go to Record <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            </button>
                        </div>

                        <h3 className="font-bold text-lg text-zinc-900 dark:text-white mb-1">
                            {item.Name || item.customerName || item.description || item.ProductName || "Unknown"}
                        </h3>

                        <div className="text-sm text-zinc-500 space-y-1">
                            {category === 'Member' && (
                                <>
                                    <p>ID: {item.MembershipReceiptnumber}</p>
                                    <p>Phone: {item.Mobile}</p>
                                    <p>Status: {item.MembershipStatus}</p>
                                </>
                            )}
                            {category === 'Protein' && (
                                <>
                                    <p>Brand: {item.Brand}</p>
                                    <p>Flavor: {item.Flavour}</p>
                                    <p>Stock: {item.Quantity}</p>
                                </>
                            )}
                            {category === 'Invoice' && (
                                <>
                                    <p>Invoice #: {item.id ? item.id.substring(0, 8) : '-'}</p>
                                    <p>Amount: ₹{item.total}</p>
                                    <p>Date: {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : '-'}</p>
                                </>
                            )}
                            {category === 'Expense' && (
                                <>
                                    <p>Category: {item.category}</p>
                                    <p>Amount: ₹{item.amount}</p>
                                    <p>Date: {item.date ? new Date(item.date).toLocaleDateString() : '-'}</p>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
