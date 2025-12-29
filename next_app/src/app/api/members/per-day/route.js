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

        // Validate basic fields
        const requiredFields = ['Name', 'Days', 'StartDate', 'EndDate', 'Amount'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
            }
        }

        const safeBigInt = (val) => val ? BigInt(val) : null;
        const safeInt = (val) => val ? parseInt(val) : null;
        const safeFloat = (val) => val ? parseFloat(val) : null;

        // 1. Create a MEMBER record (PlanType = "PerDay")
        // Mapping PerDay fields to Member model
        const newMember = await prisma.member.create({
            data: {
                gymId: authPayload.gymId,
                Name: data.Name,
                Gender: data.Gender,
                Age: safeInt(data.Age),
                PlanType: data.PlanType || 'PerDay',
                AccessStatus: 'yes', // Temporary access
                // Map Start/End to dates? Member has DateOfJoining, NextDuedate.
                // Or just use Remark/PlanPeriod for details.
                DateOfJoining: data.StartDate,
                PlanPeriod: `${data.Days} Days`,
                NextDuedate: data.EndDate,
                MembershipStatus: 'Active',
                Billtype: 'PerDay',

                weight: safeInt(data.weight),
                height: safeFloat(data.height),
                Mobile: safeBigInt(data.Mobile),
                Whatsapp: safeBigInt(data.Whatsapp),
                Aadhaar: safeBigInt(data.Aadhaar),

                LastPaymentAmount: safeInt(data.Amount),
                LastPaymentDate: new Date().toISOString().split('T')[0],

                // Audit
                lastEditedBy: authPayload.username, // Automatically set
                editReason: 'New Per Day Admission'
            }
        });

        // 2. Create INVOICE Record
        if (safeInt(data.Amount) > 0) {
            await prisma.invoice.create({
                data: {
                    gymId: authPayload.gymId,
                    memberId: newMember.id,
                    customerName: newMember.Name,
                    invoiceDate: new Date(),
                    items: [
                        {
                            description: `Per Day Admission - ${data.Days} Days`,
                            quantity: 1,
                            rate: safeInt(data.Amount),
                            amount: safeInt(data.Amount)
                        }
                    ],
                    subTotal: safeInt(data.Amount),
                    total: safeInt(data.Amount),
                    status: 'PAID',
                    paymentMode: 'CASH',
                    lastEditedBy: authPayload.username
                }
            });
        }

        return NextResponse.json({
            message: "Per-day basis admission processed successfully",
            id: newMember.id
        }, { status: 201 });

    } catch (error) {
        console.error("Per-day error:", error);
        return NextResponse.json({ error: `An error occurred: ${error.message}` }, { status: 500 });
    }
}
