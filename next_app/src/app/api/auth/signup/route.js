import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function POST(request) {
    try {
        const body = await request.json();
        const { GYMNAME: gymname, EMAILID: email, username, password } = body;

        // Check if fields are present
        if (!gymname || !email || !username || !password) {
            return new NextResponse("Missing required fields", { status: 400 });
        }

        // Check for existing users/gyms
        const existingEmail = await prisma.gym.findUnique({ where: { email } });
        if (existingEmail) {
            return new NextResponse("Email already registered in another gym!", { status: 400 });
        }

        const existingUsername = await prisma.gym.findUnique({ where: { username } });
        if (existingUsername) {
            return new NextResponse("Username already exists!", { status: 400 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create Gym
        const newGym = await prisma.gym.create({
            data: {
                gymname,
                email,
                username,
                password: hashedPassword,
            },
        });

        return new NextResponse("Registered Successfully!", { status: 201 });

    } catch (error) {
        console.error("Signup error:", error);
        return new NextResponse("An error occurred during registration.", { status: 500 });
    }
}
