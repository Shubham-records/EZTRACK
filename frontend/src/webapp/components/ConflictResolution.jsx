import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, X, AlertCircle, ArrowRight } from 'lucide-react';

export default function ConflictResolution({ conflicts, onResolve, onCancel }) {
    const [resolutions, setResolutions] = useState({}); // { [index]: 'new' | 'existing' | 'merge' }
    const [expandedIndex, setExpandedIndex] = useState(0);

    const handleResolve = (index, decision) => {
        setResolutions(prev => ({ ...prev, [index]: decision }));
        // Auto expand next
        if (index < conflicts.length - 1) {
            setExpandedIndex(index + 1);
        }
    };

    const finalizeResolutions = () => {
        const toCreate = [];
        const toUpdate = [];

        conflicts.forEach((conflict, index) => {
            const decision = resolutions[index];
            if (decision === 'new') {
                toCreate.push(conflict.new);
            } else if (decision === 'existing') {
                // Do nothing, keep existing
            } else if (decision === 'merge') {
                // Merge: take existing fields, overwrite with new, keep ID
                toUpdate.push({ ...conflict.existing, ...conflict.new, _id: conflict.existing._id || conflict.existing.id });
            }
        });
        onResolve({ toCreate, toUpdate });
    };

    const notResolvedCount = conflicts.length - Object.keys(resolutions).length;

    return (
        <div className="flex flex-col h-full bg-surface-light dark:bg-surface-dark">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="font-bold text-lg text-zinc-900 dark:text-white">Resolve Duplicates</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {conflicts.length} duplicates detected. Please verify each record.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 stitch-scrollbar">
                {conflicts.map((conflict, index) => {
                    const isExpanded = expandedIndex === index;
                    const resolution = resolutions[index];

                    return (
                        <div key={index} className={`border rounded-xl transition-all ${isExpanded
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                            }`}>
                            <div
                                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                                className="p-4 flex items-center justify-between cursor-pointer"
                            >
                                <div className="flex items-center gap-3">
                                    {isExpanded ? <ChevronDown size={18} className="text-zinc-400" /> : <ChevronRight size={18} className="text-zinc-400" />}
                                    <div className="flex flex-col">
                                        <span className="font-medium text-zinc-900 dark:text-white">
                                            {conflict.new.Name}
                                        </span>
                                        <span className="text-xs text-rose-500 flex items-center gap-1 font-semibold">
                                            Duplicate found by:
                                            {[
                                                conflict.new.Mobile === conflict.existing.Mobile ? 'Mobile' : '',
                                                conflict.new.Whatsapp === conflict.existing.Whatsapp ? 'Whatsapp' : '',
                                                conflict.new.Aadhaar === conflict.existing.Aadhaar ? 'Aadhaar' : ''
                                            ].filter(Boolean).join(', ')}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {resolution && (
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${resolution === 'new' ? 'bg-emerald-100 text-emerald-700' :
                                            resolution === 'existing' ? 'bg-zinc-100 text-zinc-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                            {resolution === 'new' ? 'Create New' : resolution === 'existing' ? 'Keep Existing' : 'Merged'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 grid grid-cols-2 gap-4">
                                    {/* Left: Existing */}
                                    <div className="p-4 rounded-lg space-y-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Existing Record</span>
                                        </div>
                                        <RecordDetails record={conflict.existing} highlight={conflict.new} />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleResolve(index, 'existing'); }}
                                            className={`w-full py-2 rounded-lg text-sm font-medium border transition-all ${resolution === 'existing'
                                                ? 'bg-zinc-600 text-white border-transparent'
                                                : 'border-zinc-300 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700'
                                                }`}
                                        >
                                            Keep Existing
                                        </button>
                                    </div>

                                    {/* Right: New */}
                                    <div className="p-4 rounded-lg space-y-3 bg-primary/5 border border-primary/20">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-primary">Incoming Record</span>
                                        </div>
                                        <RecordDetails record={conflict.new} highlight={conflict.existing} />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleResolve(index, 'new'); }}
                                            className={`w-full py-2 rounded-lg text-sm font-medium border transition-all ${resolution === 'new'
                                                ? 'bg-primary text-white border-transparent'
                                                : 'border-primary/30 text-primary hover:bg-primary/10'
                                                }`}
                                        >
                                            Create New
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 bg-surface-light dark:bg-surface-dark">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                >
                    Cancel Import
                </button>
                <button
                    onClick={finalizeResolutions}
                    disabled={notResolvedCount > 0}
                    className="px-6 py-2 bg-primary hover:bg-teal-700 text-white rounded-lg font-medium shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {notResolvedCount > 0 ? `Resolve ${notResolvedCount} Conflicts` : 'Confirm & Import'}
                </button>
            </div>
        </div>
    );
}

function RecordDetails({ record, highlight }) {
    const fields = ['Name', 'Mobile', 'Whatsapp', 'Aadhaar', 'Gender', 'PlanPeriod', 'PlanType'];

    return (
        <div className="space-y-2 text-sm">
            {fields.map(field => {
                const val = record[field];
                const otherVal = highlight ? highlight[field] : null;
                const isDiff = val && otherVal && String(val) !== String(otherVal);

                if (!val) return null;

                return (
                    <div key={field} className="flex flex-col">
                        <span className="text-xs opacity-50 text-zinc-500 uppercase">{field}</span>
                        <span className={`font-medium truncate ${isDiff ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-zinc-800 dark:text-zinc-200'}`}>
                            {val.toString()}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
