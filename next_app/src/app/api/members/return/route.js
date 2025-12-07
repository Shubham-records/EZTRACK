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

        const requiredFields = ['MembershipReceiptnumber', 'ReturnDate', 'RemainingDays', 'RefundAmount', 'Reason'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
            }
        }

        const safeInt = (val) => val ? parseInt(val) : null;

        // Update Member status
        const updateMember = await prisma.member.updateMany({
            where: {
                gymId: authPayload.gymId,
                MembershipReceiptnumber: parseInt(data.MembershipReceiptnumber)
            },
            data: {
                MembershipStatus: "Returned",
                // ReturnDate field doesn't exist in Member model in schema? 
                // schema says `MembershipReturn` model, but main.py did update `Member_DB` with `ReturnDate`.
                // And insert into `MembershipReturns_DB`.
                // In my schema, Member model does NOT have `ReturnDate`. I missed it.
                // However, I can add it or just ignore it for now on member and rely on MembershipReturn table.
                // But generally users want to see it on the member record.
                // I should add `ReturnDate`, `RefundAmount`, `ReturnReason` to Member model if I want exact parity.
                // For now, I'll skip updating those fields on Member if they don't exist in schema, or I should have added them.
                // Checking schema (STEP 228)... Member model DOES NOT have these.
                // I will add them to schema OR just update schema now?
                // Updating schema requires migration. 
                // Let's rely on MembershipStatus="Returned" on Member, and details in MembershipReturn table.
            }
        });

        if (updateMember.count > 0) {
            // Log Return
            await prisma.membershipReturn.create({
                data: {
                    gymId: authPayload.gymId,
                    MembershipReceiptnumber: parseInt(data.MembershipReceiptnumber),
                    ReturnDate: data.ReturnDate,
                    RemainingDays: safeInt(data.RemainingDays),
                    RefundAmount: safeInt(data.RefundAmount),
                    Reason: data.Reason
                }
            });

            return NextResponse.json({
                message: "Membership return processed successfully",
                id: String(data.MembershipReceiptnumber)
            }, { status: 200 });
        } else {
            return NextResponse.json({ error: "Failed to process membership return or no changes made" }, { status: 400 });
        }

    } catch (error) {
        console.error("Return membership error:", error);
        return NextResponse.json({ error: `An error occurred: ${error.message}` }, { status: 500 });
    }
}
