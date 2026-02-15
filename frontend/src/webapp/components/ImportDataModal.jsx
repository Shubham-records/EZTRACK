import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, Download, CheckCircle, Loader2 } from 'lucide-react';
import { useToast } from "@/context/ToastContext";

export default function ImportDataModal({ isOpen, onClose, onSuccess, dataType = 'expense' }) {
    const { showToast } = useToast();
    const [file, setFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [importStats, setImportStats] = useState(null);
    const fileInputRef = useRef(null);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            setFile(selectedFile);
            setImportStats(null);
        }
    };

    const downloadSample = () => {
        let headers = [];
        let sampleRow = [];

        if (dataType === 'expense') {
            headers = ["Date", "Description", "Amount", "Category", "PaymentMode", "Notes"];
            sampleRow = ["2024-02-14", "Office Supplies", "500", "Supplies", "Cash", "Pens and Paper"];
        } else if (dataType === 'invoice') {
            headers = ["InvoiceDate", "CustomerName", "Total", "Status", "PaymentMode", "DueDate"];
            sampleRow = ["2024-02-14", "John Doe", "1500", "PAID", "UPI", "2024-02-20"];
        }

        const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        const fileName = `${dataType}_Import_Template.xlsx`;
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

            await bulkCreate(jsonData);

        } catch (error) {
            console.error(error);
            showToast("Error processing file: " + error.message, 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const bulkCreate = async (records) => {
        if (!records || records.length === 0) return;

        const jwtToken = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');

        const endpoint = dataType === 'expense' ? '/api/expenses/bulk-create' : '/api/invoices/bulk-create';
        const bodyKey = dataType === 'expense' ? 'expenses' : 'invoices';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jwtToken}`,
                'X-Database-Name': dbName
            },
            body: JSON.stringify({ [bodyKey]: records })
        });

        if (response.ok) {
            const result = await response.json();
            setImportStats({ total: records.length, success: result.count });
            setTimeout(() => {
                onSuccess();
                onClose();
                setFile(null);
                setImportStats(null);
            }, 2000);
        } else {
            const err = await response.json();
            throw new Error(`Failed to create ${dataType}s: ` + (err.detail || err.message || 'Unknown error'));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col bg-surface-light dark:bg-surface-dark border border-zinc-200 dark:border-zinc-800">

                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                        <FileSpreadsheet className="text-primary" />
                        Import {dataType === 'expense' ? 'Expenses' : 'Invoices'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition text-zinc-500 dark:text-zinc-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {!importStats ? (
                        <div className="space-y-6">
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
                                        <p className="text-lg font-medium text-zinc-900 dark:text-white">Click to upload</p>
                                        <p className="text-sm text-zinc-500">Excel (.xlsx) or CSV (.csv)</p>
                                    </>
                                )}
                            </div>

                            <div className="flex justify-between items-center">
                                <button
                                    onClick={downloadSample}
                                    className="flex items-center gap-2 text-sm font-medium hover:underline text-primary"
                                >
                                    <Download size={16} /> Download Template
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
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center animate-in fade-in zoom-in duration-300">
                            <div className="w-16 h-16 bg-teal-100 dark:bg-teal-900/30 text-primary rounded-full flex items-center justify-center mb-4">
                                <CheckCircle size={32} />
                            </div>
                            <h3 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white">Import Successful!</h3>
                            <p className="text-zinc-600 dark:text-zinc-400">
                                Successfully imported <span className="font-bold text-primary">{importStats.success}</span> records.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
