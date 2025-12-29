import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function PUT(request, { params }) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    try {
        const data = await request.json();

        // Remove _id if present to check for update cleanliness (Prisma doesn't like extra fields if strict, but here we select fields)
        delete data._id;
        delete data.gymId; // Prevent changing gym ownership easily
        delete data['height(ft)'];
        delete data['weight(kg)'];

        // Handle BigInts and data types
        if (data.Mobile) data.Mobile = BigInt(data.Mobile);
        if (data.Whatsapp) data.Whatsapp = BigInt(data.Whatsapp);
        if (data.Aadhaar) data.Aadhaar = BigInt(data.Aadhaar);
        if (data.MembershipReceiptnumber) data.MembershipReceiptnumber = parseInt(data.MembershipReceiptnumber);
        if (data.Age) data.Age = parseInt(data.Age);
        if (data.weight) data.weight = parseInt(data.weight);
        if (data.height) data.height = parseFloat(data.height);

        // Update
        const updatedMember = await prisma.member.update({
            where: {
                id: id,
                gymId: authPayload.gymId // Security: Make sure it belongs to the gym
            },
            data: data
        });

        const responseData = {
            ...updatedMember,
            _id: updatedMember.id,
            Mobile: updatedMember.Mobile?.toString(),
            Whatsapp: updatedMember.Whatsapp?.toString(),
            Aadhaar: updatedMember.Aadhaar?.toString()
        };

        return NextResponse.json(responseData, { status: 200 });

    } catch (error) {
        if (error.code === 'P2025') {
            return NextResponse.json({ error: "Member not found" }, { status: 404 });
        }
        console.error("Update member error:", error);
        return NextResponse.json({ error: "Start update failed" }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    try {
        await prisma.member.delete({
            where: {
                id: id,
                gymId: authPayload.gymId
            }
        });

        return NextResponse.json({ message: "Member deleted" }, { status: 200 });
    } catch (error) {
        if (error.code === 'P2025') {
            return NextResponse.json({ message: "Member not found" }, { status: 404 });
        }
        console.error("Delete member error:", error);
        return NextResponse.json({ message: "Delete failed" }, { status: 500 });
    }
}

export async function GET(request, { params }) {
    // Replaces /fetchClient/<client_id> if calling by ID, 
    // BUT legacy app calls fetchClient/<ReceiptNumber> mostly? 
    // main.py has /membersUpdate/<member_id> (ObjectId).
    // So this file handles ID based ops.
    // For ReceiptNumber based fetch, we need another route or query param.
    // Let's support getting by ID here.

    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    try {
        const member = await prisma.member.findFirst({
            where: {
                id: id,
                gymId: authPayload.gymId
            }
        });

        if (!member) {
            return NextResponse.json({ message: "Member not found" }, { status: 404 });
        }

        const responseData = {
            ...member,
            _id: member.id,
            Mobile: member.Mobile?.toString(),
            Whatsapp: member.Whatsapp?.toString(),
            Aadhaar: member.Aadhaar?.toString()
        };

        return NextResponse.json(responseData, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
