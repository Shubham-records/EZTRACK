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

        const safeBigInt = (val) => val ? BigInt(val) : null;
        const safeInt = (val) => val ? parseInt(val) : null;
        const safeFloat = (val) => val ? parseFloat(val) : null;

        const updatePromises = members.map(async (m) => {
            if (!m._id && !m.id) return null; // Update requires ID
            const id = m._id || m.id;

            return prisma.member.update({
                where: { id: id },
                data: {
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
                }
            }).catch(e => ({ error: e.message, id }));
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter(r => r && !r.error).length;
        const errors = results.filter(r => r && r.error);

        return NextResponse.json({
            count: successCount,
            message: "Members updated successfully",
            errors: errors.length > 0 ? errors : undefined
        }, { status: 200 });

    } catch (error) {
        console.error("Bulk update error:", error);
        return NextResponse.json({ message: `Failed to update members: ${error.message}` }, { status: 500 });
    }
}
