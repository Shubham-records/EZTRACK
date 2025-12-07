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

        const requiredFields = ['Name', 'Gender', 'Age', 'PlanType', 'Days', 'StartDate', 'EndDate', 'Amount'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
            }
        }

        const safeBigInt = (val) => val ? BigInt(val) : null;
        const safeInt = (val) => val ? parseInt(val) : null;
        const safeFloat = (val) => val ? parseFloat(val) : null;

        const newEntry = await prisma.perDayAdmission.create({
            data: {
                gymId: authPayload.gymId,
                Name: data.Name,
                Gender: data.Gender,
                Age: safeInt(data.Age),
                PlanType: data.PlanType,
                Days: safeInt(data.Days),
                StartDate: data.StartDate,
                EndDate: data.EndDate,
                Amount: safeInt(data.Amount),
                weight: safeInt(data.weight),
                height: safeFloat(data.height),
                Mobile: safeBigInt(data.Mobile),
                Whatsapp: safeBigInt(data.Whatsapp),
                Aadhaar: safeBigInt(data.Aadhaar)
            }
        });

        return NextResponse.json({
            message: "Per-day basis admission added successfully",
            id: newEntry.id
        }, { status: 201 });

    } catch (error) {
        console.error("Per-day error:", error);
        return NextResponse.json({ error: `An error occurred: ${error.message}` }, { status: 500 });
    }
}
