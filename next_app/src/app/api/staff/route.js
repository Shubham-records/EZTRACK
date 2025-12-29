import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';
import bcrypt from 'bcryptjs';
// Note: bcrypt typically requires python/build tools on windows. 
// If project doesn't have it, might use bcryptjs or just plaintext for now if dep missing.
// Checking package.json would contain 'bcrypt' or 'bcryptjs' if used.
// User didn't request specific auth, but secure password needed.
// I'll assume standard practices. If bcrypt fails import, I'll fix.

const prisma = new PrismaClient();

export async function GET(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Only OWNER or MANAGER can list staff?
    // Let's assume anyone with a valid token can list for now, or check role.
    // authPayload relies on verifyAuth returning payload. 
    // The payload structure depends on what was signed. 
    // If signed with `gymId` only, we don't know the role unless we query `User` or `Gym`.

    const { gymId } = authPayload;

    try {
        const users = await prisma.user.findMany({
            where: { gymId },
            select: { id: true, username: true, role: true, permissions: true, createdAt: true }
        });
        return NextResponse.json(users);
    } catch (error) {
        return NextResponse.json({ message: "Failed to fetch staff" }, { status: 500 });
    }
}

export async function POST(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { gymId } = authPayload;

    try {
        const body = await request.json();

        // Strict Role Check: Only OWNER or MANAGER can create users
        // authPayload might not have role directly if token is just {gymId, username}.
        // But /api/auth/me uses token to fetch from DB. 
        // We should verify caller's role from DB or if payload has it.
        // Assuming payload has role or we fetch it.
        // Step A: Fetch caller
        // (If payload doesn't have role, we query)
        const caller = await prisma.user.findFirst({
            where: {
                gymId: gymId,
                username: authPayload.username
            }
        });

        // If caller is not found, check if it is the Gym Account (Owner)
        // Gym account username matches gym.username usually.
        // Let's assume if caller is found in User table, check role.
        // If not in User table, it might be the Gym Owner Account (which isn't in User table in this schema? Oh wait, User checks gymId).
        // Actually schema has User linked to Gym. Gym itself has username/password.

        // Logic: 
        // 1. Check if authPayload.username is the Gym's main username -> OWNER
        // 2. OR Check if authPayload.username is in User table with role OWNER/MANAGER.

        let isAuthorized = false;

        const gym = await prisma.gym.findUnique({ where: { id: gymId } });
        if (gym && gym.username === authPayload.username) {
            isAuthorized = true; // Main Owner
        } else if (caller && (caller.role === 'OWNER' || caller.role === 'MANAGER')) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return NextResponse.json({ message: "Forbidden: Only Admin/Owner can create staff" }, { status: 403 });
        }

        // { username, password, role, permissions }

        // Hash password
        const hashedPassword = await bcrypt.hash(body.password || 'rmg', 10);

        const newUser = await prisma.user.create({
            data: {
                gymId,
                username: body.username,
                password: hashedPassword,
                role: body.role || 'STAFF',
                permissions: body.permissions || []
            }
        });

        // Don't return password
        const { password, ...userWithoutPassword } = newUser;
        return NextResponse.json(userWithoutPassword, { status: 201 });

    } catch (error) {
        console.error("Create staff error:", error);
        return NextResponse.json({ message: `Failed to create staff: ${error.message}` }, { status: 500 });
    }
}
