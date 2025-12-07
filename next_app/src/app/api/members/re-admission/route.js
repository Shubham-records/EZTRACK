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

        // Similar validation to newAdmission
        const requiredFields = ['Name', 'MembershipReceiptnumber', 'Gender', 'Age', 'DateOfReJoin', 'PlanPeriod', 'PlanType'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
            }
        }

        // Data transformation specific to Readmission
        const safeBigInt = (val) => val ? BigInt(val) : null;
        const safeInt = (val) => val ? parseInt(val) : null;
        const safeFloat = (val) => val ? parseFloat(val) : null;

        const updateData = {
            Name: data.Name,
            Gender: data.Gender,
            Age: safeInt(data.Age),
            AccessStatus: data.AccessStatus || 'no',
            height: safeFloat(data.height),
            weight: safeInt(data.weight),
            DateOfReJoin: data.DateOfReJoin, // Should be today ideally or from form
            Billtype: data.Billtype,
            Address: data.Address,
            Whatsapp: safeBigInt(data.Whatsapp),
            PlanPeriod: data.PlanPeriod,
            PlanType: data.PlanType,
            MembershipStatus: 'Active', // Force Active
            MembershipExpiryDate: data.MembershipExpiryDate,
            LastPaymentDate: data.LastPaymentDate,
            NextDuedate: data.NextDuedate,
            LastPaymentAmount: safeInt(data.LastPaymentAmount),
            RenewalReceiptNumber: safeInt(data.RenewalReceiptNumber),
            Aadhaar: safeBigInt(data.Aadhaar),
            Remark: data.Remark,
            Mobile: safeBigInt(data.Mobile),
            extraDays: data.extraDays ? String(data.extraDays) : '0',
            agreeTerms: data.agreeTerms || false
        };

        // Update Member by MembershipReceiptnumber
        const updatedMember = await prisma.member.updateMany({
            where: {
                gymId: authPayload.gymId,
                MembershipReceiptnumber: parseInt(data.MembershipReceiptnumber)
            },
            data: updateData
        });

        if (updatedMember.count > 0) {
            return NextResponse.json({
                message: "Re-admission updated successfully",
                id: String(data.MembershipReceiptnumber)
            }, { status: 200 });
        } else {
            return NextResponse.json({ error: "Failed to update re-admission or no changes made" }, { status: 400 });
        }

    } catch (error) {
        console.error("Re-admission error:", error);
        return NextResponse.json({ error: `An error occurred: ${error.message}` }, { status: 500 });
    }
}
