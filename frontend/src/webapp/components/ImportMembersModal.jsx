import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, Download, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from "@/context/ToastContext";
import ConflictResolution from './ConflictResolution';

export default function ImportMembersModal({ isOpen, onClose, onImportSuccess, dataType = 'member' }) {
    const { showToast } = useToast();
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [importStats, setImportStats] = useState(null); // { total: 0, success: 0, conflicts: [] }
    const [conflicts, setConflicts] = useState([]);
    const [cleanRecords, setCleanRecords] = useState([]);
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setImportStats(null);
            setConflicts([]);
            setCleanRecords([]);
        }
    };

    const downloadSample = () => {
        let headers = [];
        let sampleRow = [];

        if (dataType === 'member') {
            headers = [
                "Name", "MembershipReceiptnumber", "Gender", "Age", "AccessStatus", "height", "weight",
                "DateOfJoining", "DateOfReJoin", "Billtype", "Address", "Whatsapp", "PlanPeriod",
                "PlanType", "MembershipStatus", "MembershipExpiryDate", "LastPaymentDate", "NextDuedate",
                "LastPaymentAmount", "RenewalReceiptNumber", "Aadhaar", "Remark", "Mobile", "extraDays", "agreeTerms"
            ];
            // Empty sample row as requested, or minimal example
            sampleRow = ["John Doe", "1001", "Male", "25", "yes", "175", "70",
                "2024-01-01", "", "Cash", "123 Main St", "9876543210", "Monthly",
                "Strength", "Active", "2024-02-01", "2024-01-01", "2024-02-01",
                "1500", "", "123456789012", "New member", "9876543210", "0", "true"];
        } else if (dataType === 'protein') {
            headers = [
                "Year", "Month", "Brand", "ProductName", "Flavour", "Weight",
                "Quantity", "MRPPrice", "LandingPrice", "TotalPrice", "Remark"
            ];
            sampleRow = ["2024", "January", "Optimum Nutrition", "Gold Standard Whey", "Double Rich Chocolate", "2lbs",
                "10", "3500", "3000", "30000", "Stock refill"];
        }

        const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        const fileName = dataType === 'member' ? "Member_Import_Template.xlsx" : "Protein_Import_Template.xlsx";
        XLSX.writeFile(wb, fileName);
    };

    const processFile = async () => {
        if (!file) return;
        setIsUploading(true);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const workSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(workSheet);

            if (jsonData.length === 0) {
                showToast("File is empty", 'error');
                setIsUploading(false);
                return;
            }

            const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
            const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

            if (dataType === 'member') {
                // 1. Check for duplicates (only for members)
                const checkResponse = await fetch('/api/members/check-duplicates', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${jwtToken}`,
                        'X-Database-Name': dbName
                    },
                    body: JSON.stringify({ members: jsonData })
                });

                if (!checkResponse.ok) throw new Error("Failed to check duplicates");

                const checkResult = await checkResponse.json();

                if (checkResult.conflicts && checkResult.conflicts.length > 0) {
                    setConflicts(checkResult.conflicts);
                    setCleanRecords(checkResult.clean);
                    // Wait for user resolution
                } else {
                    // No conflicts, create all
                    await bulkCreate(checkResult.clean);
                }
            } else {
                // For proteins, just bulk create directly for now (duplicates can be allowed or handled simpler)
                await bulkCreate(jsonData);
            }

        } catch (error) {
            console.error(error);
            showToast("Error processing file: " + error.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const bulkCreate = async (records) => {
        if (!records || records.length === 0) return 0;
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

        const endpoint = dataType === 'member' ? '/api/members/bulk-create' : '/api/proteins/bulk-create';

        // Adjust body based on type for now to match existing API expectation
        const bodyWithKey = dataType === 'member' ? { members: records } : { stocks: records };

        const finalResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jwtToken}`,
                'X-Database-Name': dbName
            },
            body: JSON.stringify(bodyWithKey)
        });


        if (finalResponse.ok) {
            const result = await finalResponse.json();

            // For proteins, result might not have 'count' if I implement it differently, checking that next.
            const count = result.count !== undefined ? result.count : records.length;

            setImportStats({ total: records.length, success: count, conflicts: [] });
            setTimeout(() => {
                onImportSuccess();
                onClose();
            }, 2000);
            return count;
        } else {
            const err = await finalResponse.json();
            throw new Error(`Failed to create ${dataType}s: ` + (err.message || ''));
        }
    };

    const bulkUpdate = async (members) => {
        // Only for members currently
        if (dataType !== 'member') return 0;

        if (!members || members.length === 0) return 0;
        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

        const updateResponse = await fetch('/api/members/bulk-update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jwtToken}`,
                'X-Database-Name': dbName
            },
            body: JSON.stringify({ members })
        });

        if (updateResponse.ok) {
            const result = await updateResponse.json();
            return result.count;
        } else {
            const err = await updateResponse.json();
            throw new Error("Failed to update members: " + (err.message || ''));
        }
    };

    const handleResolution = async ({ toCreate, toUpdate }) => {
        setIsUploading(true);
        try {
            let createdCount = 0;
            let updatedCount = 0;

            // 1. Create clean records + resolved 'create new' records
            const createList = [...(cleanRecords || []), ...toCreate];
            if (createList.length > 0) {
                createdCount = await bulkCreate(createList);
            }

            // 2. Update resolved 'merge' records
            if (toUpdate.length > 0) {
                updatedCount = await bulkUpdate(toUpdate);
            }

            setImportStats({
                total: createList.length + toUpdate.length + conflicts.length,
                success: createdCount + updatedCount,
                conflicts: []
            });
            setConflicts([]); // Clear conflicts view

            setTimeout(() => {
                onImportSuccess();
                onClose();
            }, 2000);

        } catch (e) {
            console.error(e);
            showToast("Error resolving and importing: " + e.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] bg-surface-light dark:bg-surface-dark border border-zinc-200 dark:border-zinc-800">

                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                        <FileSpreadsheet className="text-primary" />
                        Import {dataType === 'member' ? 'Members' : 'Protein Stocks'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition text-zinc-500 dark:text-zinc-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">

                    {/* Step 1: Upload */}
                    {!importStats && conflicts.length === 0 && (
                        <div className="p-6 space-y-6">
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${file
                                    ? 'border-primary bg-teal-50 dark:bg-teal-900/10'
                                    : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                    }`}
                            >
                                <input
                                    type="file"
                                    accept=".xlsx, .csv"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                />
                                {file ? (
                                    <>
                                        <FileSpreadsheet size={48} className="text-primary mb-4" />
                                        <p className="text-lg font-medium text-zinc-900 dark:text-white">{file.name}</p>
                                        <p className="text-sm text-zinc-500">{(file.size / 1024).toFixed(2)} KB</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={48} className="mb-4 text-zinc-400" />
                                        <p className="text-lg font-medium text-zinc-900 dark:text-white">Click to upload or drag and drop</p>
                                        <p className="text-sm text-zinc-500">Excel (.xlsx) or CSV (.csv)</p>
                                    </>
                                )}
                            </div>

                            <div className="flex justify-between items-center">
                                <button
                                    onClick={downloadSample}
                                    className="flex items-center gap-2 text-sm font-medium hover:underline text-primary"
                                >
                                    <Download size={16} /> Download {dataType === 'member' ? 'Member' : 'Protein'} Template
                                </button>
                                {file && (
                                    <button
                                        onClick={processFile}
                                        disabled={isUploading}
                                        className="px-6 py-2 bg-primary hover:bg-teal-700 text-white rounded-lg font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isUploading && <Loader2 className="animate-spin" size={18} />}
                                        {isUploading ? "Processing..." : "Start Import"}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Conflicts */}
                    {conflicts.length > 0 && dataType === 'member' && (
                        <ConflictResolution
                            conflicts={conflicts}
                            onResolve={handleResolution}
                            onCancel={() => { setConflicts([]); setCleanRecords([]); setFile(null); }}
                        />
                    )}

                    {/* Step 3: Success */}
                    {importStats && importStats.success > 0 && (
                        <div className="p-6 flex flex-col items-center justify-center py-10 text-center animate-in fade-in zoom-in duration-300">
                            <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900/30 text-primary rounded-full flex items-center justify-center mb-4">
                                <CheckCircle size={32} />
                            </div>
                            <h3 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white">Import Successful!</h3>
                            <p className="text-zinc-600 dark:text-zinc-400">
                                Successfully imported/updated <span className="font-bold text-primary">{importStats.success}</span> records.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
