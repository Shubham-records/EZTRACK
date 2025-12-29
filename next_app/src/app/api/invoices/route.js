import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { gymId } = authPayload;

    try {
        const invoices = await prisma.invoice.findMany({
            where: { gymId },
            orderBy: { invoiceDate: 'desc' },
            include: { member: { select: { Name: true } } }
        });

        return NextResponse.json(invoices);
    } catch (error) {
        console.error("Fetch invoices error:", error);
        return NextResponse.json({ message: "Failed to fetch invoices" }, { status: 500 });
    }
}

export async function POST(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { gymId } = authPayload;

    try {
        const body = await request.json();
        // body: { memberId, customerName, items: [], discount, tax, paymentMode, status }

        // Calculate totals
        const items = body.items || [];
        const subTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const tax = Number(body.tax) || 0;
        const discount = Number(body.discount) || 0;
        const total = subTotal + tax - discount;

        const newInvoice = await prisma.invoice.create({
            data: {
                gymId,
                memberId: body.memberId || null,
                customerName: body.customerName || null,
                items: items,
                subTotal,
                tax,
                discount,
                total,
                status: body.status || 'PENDING',
                paymentMode: body.paymentMode || 'CASH',
                invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : new Date(),
                dueDate: body.dueDate ? new Date(body.dueDate) : null,
                lastEditedBy: authPayload.username,
                editReason: 'New Invoice'
            }
        });

        return NextResponse.json(newInvoice, { status: 201 });

    } catch (error) {
        console.error("Create invoice error:", error);
        return NextResponse.json({ message: `Failed to create invoice: ${error.message}` }, { status: 500 });
    }
}
