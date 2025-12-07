import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(request, { params }) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { client_number } = params;

    try {
        const member = await prisma.member.findFirst({
            where: {
                gymId: authPayload.gymId,
                MembershipReceiptnumber: parseInt(client_number)
            }
        });

        if (!member) {
            return NextResponse.json({ message: "Client not found" }, { status: 404 });
        }

        const renewalData = {
            Name: member.Name,
            MembershipReceiptnumber: member.MembershipReceiptnumber,
            LastPaymentDate: member.LastPaymentDate,
            LastValidityDate: member.MembershipExpiryDate,
            LastMembershipType: member.PlanType,
            Mobile: member.Mobile?.toString(),
            PlanPeriod: member.PlanPeriod,
            PlanType: member.PlanType
        };

        return NextResponse.json(renewalData, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
