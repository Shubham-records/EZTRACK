import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { gymId, username } = authPayload;

    try {
        // Try to find as User first
        let user = await prisma.user.findUnique({
            where: {
                gymId_username: {
                    gymId,
                    username
                }
            },
            select: { id: true, username: true, role: true, permissions: true }
        });

        // If not found in User, check Gym (Owner)
        if (!user) {
            const gym = await prisma.gym.findUnique({
                where: { id: gymId },
                select: { id: true, username: true } // Gym doesn't have role field, assume OWNER
            });

            if (gym && gym.username === username) {
                user = {
                    id: gym.id,
                    username: gym.username,
                    role: 'OWNER',
                    permissions: ['ALL']
                };
            }
        }

        if (!user) {
            return NextResponse.json({ message: "User not found" }, { status: 404 });
        }

        return NextResponse.json(user);

    } catch (error) {
        console.error("Auth me error:", error);
        return NextResponse.json({ message: "Internal Error" }, { status: 500 });
    }
}
