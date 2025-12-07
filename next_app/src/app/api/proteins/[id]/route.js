import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function PUT(request, { params }) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { id } = params;

    try {
        const data = await request.json();
        delete data._id;
        delete data.gymId;

        const updatedProtein = await prisma.proteinStock.update({
            where: {
                id: id,
                gymId: authPayload.gymId
            },
            data: data
        });

        const responseData = {
            ...updatedProtein,
            _id: updatedProtein.id
        };

        return NextResponse.json(responseData, { status: 200 });

    } catch (error) {
        if (error.code === 'P2025') {
            return NextResponse.json({ error: "Protein not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { id } = params;

    try {
        await prisma.proteinStock.delete({
            where: {
                id: id,
                gymId: authPayload.gymId
            }
        });

        return NextResponse.json({ message: "Protein deleted successfully" }, { status: 200 });
    } catch (error) {
        if (error.code === 'P2025') {
            return NextResponse.json({ error: "Protein not found" }, { status: 404 });
        }
        return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
}
