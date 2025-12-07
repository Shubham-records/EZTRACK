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
        const proteins = await prisma.proteinStock.findMany({
            where: {
                gymId: authPayload.gymId
            }
        });

        const mappedProteins = proteins.map(p => ({
            ...p,
            _id: p.id
        }));

        return NextResponse.json(mappedProteins, { status: 200 });
    } catch (error) {
        console.error("Fetch proteins error:", error);
        return NextResponse.json({ message: "Failed to fetch proteins" }, { status: 500 });
    }
}

export async function POST(request) {
    // Assuming there is a create protein route somewhere or future need
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Add logic if needed, strictly migrating main.py which only had GET /proteins and PUT/DELETE logic?
    // main.py didn't seem to have explicit POST /proteins. 
    // It has /proteinsUpdate and /proteinsDelete.
    // Assuming adding proteins is handled or I missed it. 
    // Checking main.py... it only lists Fetch_proteins, update_protein, delete_protein.
    // So maybe no POST? Or it was implicit or missed in my read. 
    // I'll leave POST empty for now or basic.
    return NextResponse.json({ message: "Not implemented" }, { status: 501 });
}
