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
        const { members } = await request.json();

        if (!members || !Array.isArray(members)) {
            return NextResponse.json({ message: "Invalid input" }, { status: 400 });
        }

        // Prepare data for Prisma
        const safeBigInt = (val) => val ? BigInt(val) : null;
        const safeInt = (val) => val ? parseInt(val) : null;
        const safeFloat = (val) => val ? parseFloat(val) : null;

        const membersToCreate = members.map(m => ({
            gymId: authPayload.gymId,
            Name: m.Name,
            MembershipReceiptnumber: safeInt(m.MembershipReceiptnumber),
            Gender: m.Gender,
            Age: safeInt(m.Age),
            AccessStatus: m.AccessStatus || 'no',
            height: safeFloat(m.height),
            weight: safeInt(m.weight),
            DateOfJoining: m.DateOfJoining,
            DateOfReJoin: m.DateOfReJoin,
            Billtype: m.Billtype,
            Address: m.Address,
            Whatsapp: safeBigInt(m.Whatsapp),
            PlanPeriod: m.PlanPeriod,
            PlanType: m.PlanType,
            MembershipStatus: m.MembershipStatus || 'Inactive',
            MembershipExpiryDate: m.MembershipExpiryDate,
            LastPaymentDate: m.LastPaymentDate,
            NextDuedate: m.NextDuedate,
            LastPaymentAmount: safeInt(m.LastPaymentAmount),
            RenewalReceiptNumber: safeInt(m.RenewalReceiptNumber),
            Aadhaar: safeBigInt(m.Aadhaar),
            Remark: m.Remark,
            Mobile: safeBigInt(m.Mobile),
            extraDays: m.extraDays ? String(m.extraDays) : '0',
            agreeTerms: m.agreeTerms || false
        }));

        // createMany is supported in Postgres
        const result = await prisma.member.createMany({
            data: membersToCreate
        });

        return NextResponse.json({ count: result.count, message: "Members imported successfully" }, { status: 201 });

    } catch (error) {
        console.error("Bulk create error:", error);
        return NextResponse.json({ message: `Failed to import members: ${error.message}` }, { status: 500 });
    }
}
