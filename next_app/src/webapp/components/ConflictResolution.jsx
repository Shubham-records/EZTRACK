import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, X, AlertCircle, ArrowRight } from 'lucide-react';

export default function ConflictResolution({ conflicts, onResolve, onCancel, theme }) {
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
        <div className="flex flex-col h-full">
            <div className={`p-4 border-b ${theme === 'dark' ? 'border-neutral-800' : 'border-gray-100'}`}>
                <h3 className={`font-bold text-lg ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Resolve Duplicates</h3>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                    {conflicts.length} duplicates detected. Please verify each record.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {conflicts.map((conflict, index) => {
                    const isExpanded = expandedIndex === index;
                    const resolution = resolutions[index];

                    return (
                        <div key={index} className={`border rounded-xl transition-all ${isExpanded
                            ? (theme === 'dark' ? 'border-blue-500/50 bg-neutral-800/50' : 'border-blue-500 bg-blue-50/50')
                            : (theme === 'dark' ? 'border-neutral-800 bg-neutral-900' : 'border-gray-200 bg-white')
                            }`}>
                            <div
                                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                                className="p-4 flex items-center justify-between cursor-pointer"
                            >
                                <div className="flex items-center gap-3">
                                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    <div className="flex flex-col">
                                        <span className={`font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-900'}`}>
                                            {conflict.new.Name}
                                        </span>
                                        <span className="text-xs text-red-500 flex items-center gap-1">
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
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${resolution === 'new' ? 'bg-green-100 text-green-700' :
                                            resolution === 'existing' ? 'bg-gray-100 text-gray-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                            {resolution === 'new' ? 'Create New' : resolution === 'existing' ? 'Keep Existing' : 'Merged'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t p-4 grid grid-cols-2 gap-4">
                                    {/* Left: Existing */}
                                    <div className={`p-4 rounded-lg space-y-3 ${theme === 'dark' ? 'bg-neutral-950/50' : 'bg-gray-50'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold uppercase tracking-wider opacity-50">Existing Record</span>
                                        </div>
                                        <RecordDetails record={conflict.existing} theme={theme} highlight={conflict.new} />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleResolve(index, 'existing'); }}
                                            className={`w-full py-2 rounded-lg text-sm font-medium border transition-all ${resolution === 'existing'
                                                ? 'bg-gray-600 text-white border-transparent'
                                                : 'border-gray-300 hover:bg-gray-200 text-gray-700'
                                                }`}
                                        >
                                            Keep Existing
                                        </button>
                                    </div>

                                    {/* Right: New */}
                                    <div className={`p-4 rounded-lg space-y-3 ${theme === 'dark' ? 'bg-neutral-950/50' : 'bg-gray-50'}`}>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-bold uppercase tracking-wider opacity-50">Incoming Record</span>
                                        </div>
                                        <RecordDetails record={conflict.new} theme={theme} highlight={conflict.existing} />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleResolve(index, 'new'); }}
                                            className={`w-full py-2 rounded-lg text-sm font-medium border transition-all ${resolution === 'new'
                                                ? 'bg-green-600 text-white border-transparent'
                                                : 'border-green-200 text-green-700 hover:bg-green-50'
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

            <div className={`p-4 border-t flex justify-end gap-3 ${theme === 'dark' ? 'border-neutral-800' : 'border-gray-100'}`}>
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                    Cancel Import
                </button>
                <button
                    onClick={finalizeResolutions}
                    disabled={notResolvedCount > 0}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {notResolvedCount > 0 ? `Resolve ${notResolvedCount} Conflicts` : 'Confirm & Import'}
                </button>
            </div>
        </div>
    );
}

function RecordDetails({ record, theme, highlight }) {
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
                        <span className="text-xs opacity-50">{field}</span>
                        <span className={`font-medium truncate ${isDiff ? 'text-amber-500' : ''}`}>
                            {val.toString()}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
