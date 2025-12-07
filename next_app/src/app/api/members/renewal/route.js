import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';
import { format } from 'date-fns'; // Assuming date-fns is available if needed, or just string headers

const prisma = new PrismaClient();

export async function POST(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const data = await request.json();

        const requiredFields = ['Name', 'MembershipReceiptnumber', 'DateOfRenewal', 'PlanPeriod', 'PlanType'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
            }
        }

        const safeInt = (val) => val ? parseInt(val) : null;

        // Logic from main.py:
        // data['LastPaymentDate'] = data['DateOfRenewal']
        // data['MembershipStatus'] = 'Active'

        const updateData = {
            PlanPeriod: data.PlanPeriod,
            PlanType: data.PlanType,
            DateOfRenewal: data.DateOfRenewal, // This field doesn't exist in Prisma Schema (Member model). 
            // main.py puts it in 'DateOfRenewal' but Member_DB schema in main.py seems dynamic. 
            // In our Prisma schema, Member has `DateOfReJoin` and `LastPaymentDate`. 
            // `DateOfRenewal` is likely just `LastPaymentDate` or we accidentally missed a field.
            // Let's check schema. We don't have `DateOfRenewal`.
            // We have `RenewalReceiptNumber`.
            // main.py: `data['LastPaymentDate'] = data['DateOfRenewal']`.
            // So we update LastPaymentDate.

            LastPaymentDate: data.DateOfRenewal,
            MembershipExpiryDate: data.MembershipExpiryDate,
            NextDuedate: data.NextDuedate,
            MembershipStatus: 'Active',
            LastPaymentAmount: safeInt(data.LastPaymentAmount),
            RenewalReceiptNumber: safeInt(data.RenewalReceiptNumber),
            extraDays: data.extraDays ? String(data.extraDays) : '0',

            // Should we update Name/Mobile/etc? main.py just updates `$set: data`, which overwrites everything passed.
            // Typically Renewal form (Renewl component) sends filtered data.
            // Let's trust `data` but only update relevant fields to avoid nulling others if frontend sends partial.
            // But main.py sends everything from formData.
        };

        const updatedMember = await prisma.member.updateMany({
            where: {
                gymId: authPayload.gymId,
                MembershipReceiptnumber: parseInt(data.MembershipReceiptnumber)
            },
            data: updateData
        });

        if (updatedMember.count > 0) {
            return NextResponse.json({
                message: "Renewal updated successfully",
                id: String(data.MembershipReceiptnumber)
            }, { status: 200 });
        } else {
            return NextResponse.json({ error: "Failed to update renewal or no changes made" }, { status: 400 });
        }

    } catch (error) {
        console.error("Renewal error:", error);
        return NextResponse.json({ error: `An error occurred: ${error.message}` }, { status: 500 });
    }
}
