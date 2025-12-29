import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function POST(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const data = await request.json();

        const requiredFields = ['MembershipReceiptnumber', 'ReturnDate', 'RefundAmount'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
            }
        }

        const safeInt = (val) => val ? parseInt(val) : 0;

        // 1. Update Member Status
        // Need to find Member by Receipt Number (Legacy logic).
        // Best to use ID if possible, but form sends ReceiptNumber.

        const member = await prisma.member.findFirst({
            where: {
                gymId: authPayload.gymId,
                MembershipReceiptnumber: parseInt(data.MembershipReceiptnumber)
            }
        });

        if (!member) {
            return NextResponse.json({ error: "Member not found with this Receipt Number" }, { status: 404 });
        }

        await prisma.member.update({
            where: { id: member.id },
            data: {
                MembershipStatus: "Returned", // or Cancelled
                Remark: `Returned on ${data.ReturnDate}. Reason: ${data.Reason || 'N/A'}`,
                updatedAt: new Date(),
                lastEditedBy: authPayload.username,
                editReason: `Membership Return: ${data.Reason}`
            }
        });

        // 2. Create Refund Invoice (Negative amount)
        const refundAmt = safeInt(data.RefundAmount);
        if (refundAmt > 0) {
            await prisma.invoice.create({
                data: {
                    gymId: authPayload.gymId,
                    memberId: member.id,
                    customerName: member.Name,
                    invoiceDate: new Date(),
                    items: [
                        {
                            description: `Membership Return - Refund. Reason: ${data.Reason}`,
                            quantity: 1,
                            rate: -refundAmt,
                            amount: -refundAmt
                        }
                    ],
                    subTotal: -refundAmt,
                    total: -refundAmt,
                    status: 'PAID', // Money returned
                    paymentMode: 'CASH', // Assuming cash return
                    lastEditedBy: authPayload.username,
                    editReason: 'Refund Invoice'
                }
            });
        }

        return NextResponse.json({
            message: "Membership return processed successfully",
            id: member.id
        }, { status: 200 });

    } catch (error) {
        console.error("Return membership error:", error);
        return NextResponse.json({ error: `An error occurred: ${error.message}` }, { status: 500 });
    }
}
