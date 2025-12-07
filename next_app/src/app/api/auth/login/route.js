import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const prisma = new PrismaClient();
const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET_KEY || 'default_secret_key');

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json({ message: "Missing username or password" }, { status: 400 });
        }

        // Find Gym by username
        const gym = await prisma.gym.findUnique({ where: { username } });

        if (!gym) {
            return NextResponse.json({ message: "Username not found!" }, { status: 404 });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, gym.password);

        if (!isPasswordValid) {
            return NextResponse.json({ message: "Incorrect password!" }, { status: 401 });
        }

        // Generate JWT
        const token = await new SignJWT({
            gymId: gym.id,
            username: gym.username
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('12h') // Extended to 12h for convenience
            .sign(SECRET_KEY);

        // Return response matching frontend expectations
        // Frontend expects: { message, eztracker_jwt_access_control_token, eztracker_jwt_databaseName_control_token }
        // We send gym.id as 'eztracker_jwt_databaseName_control_token' (it's really just an ID now)
        // or we can send an encrypted version if we want to mimic the old behavior,
        // but sending the ID is cleaner. The frontend treats it as an opaque string.

        return NextResponse.json({
            message: "Login successful!",
            eztracker_jwt_access_control_token: token,
            eztracker_jwt_databaseName_control_token: gym.id
        }, { status: 200 });

    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json({ message: "An error occurred during login." }, { status: 500 });
    }
}
