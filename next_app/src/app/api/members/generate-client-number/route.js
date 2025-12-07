import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        // Find member with highest MembershipReceiptnumber
        const highestReceipt = await prisma.member.findFirst({
            where: {
                gymId: authPayload.gymId
            },
            orderBy: {
                MembershipReceiptnumber: 'desc'
            }
        });

        const highestNumber = highestReceipt && highestReceipt.MembershipReceiptnumber
            ? highestReceipt.MembershipReceiptnumber
            : 0;

        return NextResponse.json({ clientNumber: highestNumber + 1 });
    } catch (error) {
        console.error("Generate Client Number error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
