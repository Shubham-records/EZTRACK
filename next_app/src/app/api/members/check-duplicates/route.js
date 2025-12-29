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
        const { members } = await request.json();

        if (!members || !Array.isArray(members)) {
            return NextResponse.json({ message: "Invalid input" }, { status: 400 });
        }

        const mobiles = members.map(m => m.Mobile).filter(Boolean).map(m => BigInt(m));
        const whatsapps = members.map(m => m.Whatsapp).filter(Boolean).map(w => BigInt(w));
        const aadhaars = members.map(m => m.Aadhaar).filter(Boolean).map(a => BigInt(a));

        const existingMembers = await prisma.member.findMany({
            where: {
                gymId: authPayload.gymId,
                OR: [
                    { Mobile: { in: mobiles.length > 0 ? mobiles : undefined } },
                    { Whatsapp: { in: whatsapps.length > 0 ? whatsapps : undefined } },
                    { Aadhaar: { in: aadhaars.length > 0 ? aadhaars : undefined } }
                ]
            }
        });

        const conflicts = [];
        const clean = [];

        for (const newMember of members) {
            const match = existingMembers.find(existing => {
                const sameMobile = newMember.Mobile && existing.Mobile && BigInt(newMember.Mobile) === existing.Mobile;
                const sameWhatsapp = newMember.Whatsapp && existing.Whatsapp && BigInt(newMember.Whatsapp) === existing.Whatsapp;
                const sameAadhaar = newMember.Aadhaar && existing.Aadhaar && BigInt(newMember.Aadhaar) === existing.Aadhaar;
                return sameMobile || sameWhatsapp || sameAadhaar;
            });

            if (match) {
                conflicts.push({
                    new: newMember,
                    existing: {
                        ...match,
                        _id: match.id,
                        Mobile: match.Mobile?.toString(),
                        Whatsapp: match.Whatsapp?.toString(),
                        Aadhaar: match.Aadhaar?.toString(),
                        createdAt: match.createdAt.toISOString(),
                        updatedAt: match.updatedAt.toISOString()
                    }
                });
            } else {
                clean.push(newMember);
            }
        }

        return NextResponse.json({ clean, conflicts });

    } catch (error) {
        console.error("Check duplicates error:", error);
        return NextResponse.json({ message: `Failed to check duplicates: ${error.message}` }, { status: 500 });
    }
}
