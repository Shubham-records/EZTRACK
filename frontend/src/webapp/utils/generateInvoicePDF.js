import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generate a comprehensive invoice PDF with gym branding, all billing details,
 * and terms & conditions.
 *
 * @param {Object} invoiceData     — Invoice data (items, total, customer, dates, etc.)
 * @param {Object} branchDetails   — Gym/branch details (name, logo, address, phone, etc.)
 * @param {Object} gymSettings     — GymSettings (GST, prefix, etc.)
 * @param {Array}  termsPoints     — Array of {text} for T&C
 * @returns {jsPDF} doc
 */
export function generateInvoicePDF(invoiceData, branchDetails = {}, gymSettings = {}, termsPoints = []) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // ──────────────── HEADER ────────────────
    const gymName = branchDetails.gymName || localStorage.getItem('eztracker_jwt_gymName_control_token') || 'EZTRACK Gym';
    let headerY = 14;

    // Logo (if base64 provided in branchDetails.logoBase64)
    let logoEndX = 14;
    if (branchDetails.logoBase64) {
        try {
            doc.addImage(branchDetails.logoBase64, 'PNG', 14, headerY, 22, 22);
            logoEndX = 40;
        } catch (e) {
            console.warn('Failed to add logo to PDF', e);
        }
    }

    // Gym Name
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(20, 184, 166); // Primary teal
    doc.text(gymName, logoEndX, headerY + 6);

    // Slogan
    if (branchDetails.slogan) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(120);
        doc.text(branchDetails.slogan, logoEndX, headerY + 12);
    }

    // Address line
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    const addressParts = [branchDetails.address, branchDetails.city, branchDetails.state, branchDetails.pincode].filter(Boolean);
    if (addressParts.length > 0) {
        doc.text(addressParts.join(', '), logoEndX, headerY + 17);
    }

    // Contact line
    const contactParts = [];
    if (branchDetails.phone) contactParts.push(`Ph: ${branchDetails.phone}`);
    if (branchDetails.whatsapp) contactParts.push(`WA: ${branchDetails.whatsapp}`);
    if (branchDetails.website) contactParts.push(branchDetails.website);
    if (contactParts.length > 0) {
        doc.text(contactParts.join('  |  '), logoEndX, headerY + 21);
    }

    // GSTIN
    if (gymSettings?.gstin) {
        doc.text(`GSTIN: ${gymSettings.gstin}`, logoEndX, headerY + 25);
    }

    // ──────────────── RIGHT SIDE: INVOICE META ────────────────
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text('INVOICE', pageWidth - 14, headerY + 6, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80);

    const invoiceDate = invoiceData.invoiceDate
        ? new Date(invoiceData.invoiceDate).toLocaleDateString()
        : new Date().toLocaleDateString();
    doc.text(`Date: ${invoiceDate}`, pageWidth - 14, headerY + 12, { align: 'right' });

    if (invoiceData.id) {
        const receiptNo = (gymSettings?.invoicePrefix || 'EZT-') + invoiceData.id.slice(0, 8).toUpperCase();
        doc.text(`Receipt: ${receiptNo}`, pageWidth - 14, headerY + 17, { align: 'right' });
    }

    if (invoiceData.status) {
        doc.setFont(undefined, 'bold');
        const statusColor = invoiceData.status === 'PAID' ? [16, 185, 129] : invoiceData.status === 'PARTIAL' ? [245, 158, 11] : [239, 68, 68];
        doc.setTextColor(...statusColor);
        doc.text(`Status: ${invoiceData.status}`, pageWidth - 14, headerY + 22, { align: 'right' });
    }

    // ──────────────── DIVIDER ────────────────
    const dividerY = headerY + 30;
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(14, dividerY, pageWidth - 14, dividerY);

    // ──────────────── CUSTOMER DETAILS + MEMBERSHIP DETAILS ────────────────
    let detailY = dividerY + 8;
    doc.setTextColor(0);
    doc.setFontSize(10);

    // Left column: Billed To
    doc.setFont(undefined, 'bold');
    doc.text('BILLED TO:', 14, detailY);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);

    detailY += 6;
    const customerName = invoiceData.customerName || invoiceData.memberName || 'N/A';
    doc.text(`Name: ${customerName}`, 14, detailY);

    if (invoiceData.clientNumber || invoiceData.MembershipReceiptnumber) {
        detailY += 5;
        doc.text(`Client #: ${invoiceData.clientNumber || invoiceData.MembershipReceiptnumber}`, 14, detailY);
    }

    if (invoiceData.customerPhone || invoiceData.Mobile) {
        detailY += 5;
        doc.text(`Mobile: ${invoiceData.customerPhone || invoiceData.Mobile}`, 14, detailY);
    }

    if (invoiceData.customerWhatsapp || invoiceData.Whatsapp) {
        detailY += 5;
        doc.text(`WhatsApp: ${invoiceData.customerWhatsapp || invoiceData.Whatsapp}`, 14, detailY);
    }

    if (invoiceData.customerAddress || invoiceData.Address) {
        detailY += 5;
        const addr = doc.splitTextToSize(`Address: ${invoiceData.customerAddress || invoiceData.Address}`, 75);
        doc.text(addr, 14, detailY);
        detailY += (addr.length - 1) * 4;
    }

    if (invoiceData.Aadhaar) {
        detailY += 5;
        const aadhaar = String(invoiceData.Aadhaar);
        doc.text(`Aadhaar: ****${aadhaar.slice(-4)}`, 14, detailY);
    }

    // Right column: Membership Details
    let rightY = dividerY + 8;
    const rightX = 120;

    const hasMembershipDetails = invoiceData.planType || invoiceData.PlanType || invoiceData.planPeriod || invoiceData.PlanPeriod;

    if (hasMembershipDetails) {
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('MEMBERSHIP DETAILS:', rightX, rightY);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);

        rightY += 6;
        if (invoiceData.billType || invoiceData.Billtype || invoiceData.editReason) {
            doc.text(`Type: ${invoiceData.billType || invoiceData.Billtype || invoiceData.editReason}`, rightX, rightY);
            rightY += 5;
        }
        if (invoiceData.planType || invoiceData.PlanType) {
            doc.text(`Plan: ${invoiceData.planType || invoiceData.PlanType}`, rightX, rightY);
            rightY += 5;
        }
        if (invoiceData.planPeriod || invoiceData.PlanPeriod) {
            doc.text(`Duration: ${invoiceData.planPeriod || invoiceData.PlanPeriod}`, rightX, rightY);
            rightY += 5;
        }
        if (invoiceData.dateOfJoining || invoiceData.DateOfJoining) {
            doc.text(`Join Date: ${invoiceData.dateOfJoining || invoiceData.DateOfJoining}`, rightX, rightY);
            rightY += 5;
        }
        if (invoiceData.expiryDate || invoiceData.MembershipExpiryDate) {
            doc.text(`Expiry: ${invoiceData.expiryDate || invoiceData.MembershipExpiryDate}`, rightX, rightY);
            rightY += 5;
        }
        if (invoiceData.nextDueDate || invoiceData.NextDuedate) {
            doc.text(`Next Due: ${invoiceData.nextDueDate || invoiceData.NextDuedate}`, rightX, rightY);
            rightY += 5;
        }
    }

    // ──────────────── ITEMS TABLE ────────────────
    const tableStartY = Math.max(detailY, rightY) + 10;

    const tableData = [];
    let subTotal = 0;

    if (invoiceData.items && Array.isArray(invoiceData.items)) {
        invoiceData.items.forEach(item => {
            const qty = item.quantity || 1;
            const rate = item.rate || item.amount || 0;
            const amount = item.amount || (qty * rate);
            tableData.push([
                item.description || 'Item',
                qty,
                `Rs ${Number(rate).toLocaleString()}`,
                `Rs ${Number(amount).toLocaleString()}`
            ]);
            subTotal += amount;
        });
    } else {
        // Fallback: build items from invoice fields
        const desc = invoiceData.editReason || invoiceData.billType || 'Membership Fees';
        const total = invoiceData.total || 0;
        tableData.push([desc, 1, `Rs ${Number(total).toLocaleString()}`, `Rs ${Number(total).toLocaleString()}`]);
        subTotal = total;
    }

    autoTable(doc, {
        startY: tableStartY,
        head: [['Description', 'Qty', 'Rate (₹)', 'Amount (₹)']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [20, 184, 166],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
        },
        bodyStyles: { fontSize: 9 },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { halign: 'center', cellWidth: 25 },
            2: { halign: 'right', cellWidth: 35 },
            3: { halign: 'right', cellWidth: 35 },
        },
        margin: { left: 14, right: 14 },
    });

    // ──────────────── PAYMENT SUMMARY ────────────────
    let summaryY = (doc.lastAutoTable?.finalY || doc.previousAutoTable?.finalY || tableStartY + 30) + 10;

    // Summary box on the right side
    const summaryX = 120;
    const summaryWidth = pageWidth - 14 - summaryX;

    doc.setFillColor(248, 248, 248);
    doc.roundedRect(summaryX, summaryY - 4, summaryWidth, 46, 3, 3, 'F');

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text('Payment Summary', summaryX + 4, summaryY + 2);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    let sy = summaryY + 10;

    // Sub Total
    doc.text('Sub Total:', summaryX + 4, sy);
    doc.text(`Rs ${Number(subTotal).toLocaleString()}`, pageWidth - 18, sy, { align: 'right' });
    sy += 6;

    // GST
    if (gymSettings?.enableGST && invoiceData.tax) {
        doc.text(`GST (${gymSettings.memberGSTPercent || 18}%):`, summaryX + 4, sy);
        doc.text(`Rs ${Number(invoiceData.tax).toLocaleString()}`, pageWidth - 18, sy, { align: 'right' });
        sy += 6;
    }

    // Discount
    if (invoiceData.discount && invoiceData.discount > 0) {
        doc.setTextColor(16, 185, 129);
        doc.text('Discount:', summaryX + 4, sy);
        doc.text(`-Rs ${Number(invoiceData.discount).toLocaleString()}`, pageWidth - 18, sy, { align: 'right' });
        doc.setTextColor(0);
        sy += 6;
    }

    // Total
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', summaryX + 4, sy);
    doc.text(`Rs ${Number(invoiceData.total || subTotal).toLocaleString()}`, pageWidth - 18, sy, { align: 'right' });
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    sy += 6;

    // Paid / Balance
    if (invoiceData.paidAmount !== undefined) {
        doc.text('Paid:', summaryX + 4, sy);
        doc.text(`Rs ${Number(invoiceData.paidAmount).toLocaleString()}`, pageWidth - 18, sy, { align: 'right' });
        sy += 6;

        const balance = (invoiceData.total || subTotal) - invoiceData.paidAmount;
        if (balance > 0) {
            doc.setTextColor(220, 38, 38);
            doc.setFont(undefined, 'bold');
            doc.text('Balance Due:', summaryX + 4, sy);
            doc.text(`Rs ${Number(balance).toLocaleString()}`, pageWidth - 18, sy, { align: 'right' });
            doc.setTextColor(0);
            doc.setFont(undefined, 'normal');
            sy += 6;
        }
    }

    // Payment Mode
    doc.text(`Mode: ${invoiceData.paymentMode || 'CASH'}`, summaryX + 4, sy);

    // ──────────────── TERMS & CONDITIONS ────────────────
    let termsY = Math.max(sy + 15, (doc.lastAutoTable?.finalY || 0) + 20);

    if (termsPoints && termsPoints.length > 0) {
        if (termsY > 255) {
            doc.addPage();
            termsY = 20;
        }

        doc.setDrawColor(200);
        doc.line(14, termsY - 4, pageWidth - 14, termsY - 4);

        doc.setFont(undefined, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text('Terms & Conditions:', 14, termsY);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100);

        termsY += 5;
        termsPoints.forEach((term, idx) => {
            const splitText = doc.splitTextToSize(`${idx + 1}. ${term.text}`, pageWidth - 28);
            if (termsY + (splitText.length * 3.5) > 280) {
                doc.addPage();
                termsY = 20;
            }
            doc.text(splitText, 14, termsY);
            termsY += (splitText.length * 3.5) + 1.5;
        });
    } else if (gymSettings?.showTermsOnInvoice && gymSettings?.invoiceTermsText) {
        if (termsY > 255) {
            doc.addPage();
            termsY = 20;
        }

        doc.setDrawColor(200);
        doc.line(14, termsY - 4, pageWidth - 14, termsY - 4);

        doc.setFont(undefined, 'bold');
        doc.setFontSize(9);
        doc.text('Terms & Conditions:', 14, termsY);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100);

        termsY += 5;
        const splitText = doc.splitTextToSize(gymSettings.invoiceTermsText, pageWidth - 28);
        doc.text(splitText, 14, termsY);
    }

    // ──────────────── FOOTER ────────────────
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text('Generated by EZTRACK', 14, 290);
    doc.text('Authorized Signatory', pageWidth - 14, 290, { align: 'right' });

    return doc;
}
