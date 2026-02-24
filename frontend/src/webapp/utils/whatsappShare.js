/**
 * Share invoice via WhatsApp with customizable template messages.
 * Mobile: Uses navigator.share() to attach PDF directly.
 * Desktop: Downloads PDF + opens WhatsApp Web with greeting message.
 *
 * @param {string} phoneNumber     — Customer phone/WhatsApp number
 * @param {Blob}   pdfBlob         — Generated invoice PDF blob
 * @param {Object} invoiceData     — Invoice data for template rendering
 * @param {string} templateMessage — Pre-rendered WhatsApp template (already has placeholders replaced)
 */
export async function shareViaWhatsApp(phoneNumber, pdfBlob, invoiceData, templateMessage) {
    if (!phoneNumber) {
        console.warn("No phone number provided for WhatsApp sharing");
        return;
    }

    const formattedPhone = formatPhoneForWhatsApp(phoneNumber);
    const customerName = invoiceData.customerName || invoiceData.memberName || 'Customer';
    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    const fileName = `Invoice_${customerName.replace(/\s+/g, '_')}_${dateStr}.pdf`;

    // Use the template message if provided, otherwise fall back to simple greeting
    const message = templateMessage || buildFallbackMessage(invoiceData);

    // Try mobile sharing with file attachment first
    if (isMobileDevice() && pdfBlob && navigator.canShare) {
        try {
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
            const shareData = {
                text: message,
                files: [file],
            };

            if (navigator.canShare(shareData)) {
                await navigator.share(shareData);
                return; // Successfully shared via mobile share sheet
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.warn('Mobile share failed, falling back to desktop method', err);
            } else {
                return; // User cancelled the share
            }
        }
    }

    // Desktop fallback: Download PDF + open WhatsApp Web
    if (pdfBlob) {
        downloadPDF(pdfBlob, fileName);
    }

    // Open WhatsApp Web with pre-filled message after a short delay
    setTimeout(() => {
        const whatsappUrl = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    }, 800);
}

/**
 * Render a template string by replacing placeholders with actual data.
 *
 * @param {string} template    — Template with {placeholders}
 * @param {Object} data        — Data to fill placeholders
 * @returns {string} rendered message
 */
export function renderTemplate(template, data) {
    if (!template) return '';
    return template
        .replace(/{customerName}/g, data.customerName || data.memberName || 'Valued Customer')
        .replace(/{gymName}/g, data.gymName || '')
        .replace(/{total}/g, data.total != null ? String(data.total) : '0')
        .replace(/{paidAmount}/g, data.paidAmount != null ? String(data.paidAmount) : String(data.total || '0'))
        .replace(/{balance}/g, data.balance != null ? String(data.balance) : '0')
        .replace(/{planType}/g, data.planType || data.PlanType || '')
        .replace(/{planPeriod}/g, data.planPeriod || data.PlanPeriod || '')
        .replace(/{date}/g, data.date || new Date().toLocaleDateString())
        .replace(/{paymentMode}/g, data.paymentMode || 'CASH')
        .replace(/{branchName}/g, data.branchName || '');
}

/**
 * Fetch the WhatsApp template for a given billing type.
 *
 * @param {string} templateType — "Admission", "Re-Admission", "Renewal", "Protein"
 * @returns {Promise<string>} messageTemplate
 */
export async function fetchWhatsAppTemplate(templateType) {
    try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        const res = await fetch(`/api/whatsapp-templates/${templateType}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Database-Name': dbName,
            }
        });
        if (res.ok) {
            const data = await res.json();
            return data.messageTemplate || '';
        }
    } catch (e) {
        console.error('Failed to fetch WhatsApp template', e);
    }
    return '';
}

/**
 * Fetch branch/gym details for invoice generation.
 *
 * @param {string} branchId — optional branch ID
 * @returns {Promise<Object>} branchDetails including logoBase64
 */
export async function fetchBranchDetailsForInvoice(branchId = null) {
    try {
        const token = localStorage.getItem('eztracker_jwt_access_control_token');
        const dbName = localStorage.getItem('eztracker_jwt_databaseName_control_token');
        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Database-Name': dbName,
        };

        const url = branchId
            ? `/api/branch-details/for-invoice?branch_id=${branchId}`
            : '/api/branch-details/for-invoice';
        const res = await fetch(url, { headers });
        if (!res.ok) return {};
        const details = await res.json();

        // Also fetch logo as base64
        if (details.hasLogo) {
            try {
                const logoRes = await fetch('/api/branch-details/logo/base64', { headers });
                if (logoRes.ok) {
                    const logoData = await logoRes.json();
                    details.logoBase64 = logoData.logo;
                }
            } catch (e) {
                console.warn('Failed to fetch logo', e);
            }
        }

        return details;
    } catch (e) {
        console.error('Failed to fetch branch details', e);
        return {};
    }
}


// ────────── Helpers ──────────

function formatPhoneForWhatsApp(phone) {
    let p = String(phone).replace(/\D/g, '');
    if (p.length === 10) p = '91' + p; // India country code
    return p;
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function downloadPDF(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

function buildFallbackMessage(invoiceData) {
    const gymName = localStorage.getItem('eztracker_jwt_gymName_control_token') || 'EZTRACK Gym';
    return `Hi ${invoiceData.customerName || 'there'}! 🙏 Thank you for choosing ${gymName}. Please find your invoice attached. Stay fit! 💪`;
}
