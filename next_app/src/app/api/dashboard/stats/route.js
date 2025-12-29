import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { gymId } = authPayload;

    try {
        // 1. Active Members
        const activeMembersCount = await prisma.member.count({
            where: {
                gymId,
                MembershipStatus: { in: ['Active', 'active'] }
            }
        });

        // 2. Today's Collection (Invoices + manual logic if needed?)
        // Assuming we sum up 'LastPaymentAmount' if 'LastPaymentDate' is today (legacy) 
        // OR sum up Invoices for today.
        // Let's use legacy Member payments for now as Invoices are new.
        const today = new Date();
        const todayString = today.toISOString().split('T')[0]; // YYYY-MM-DD ? Format in DB is mixed?
        // DB 'LastPaymentDate' is String. '2024-01-01' usually.
        // Let's match typical format YYYY-MM-DD.
        // We might need to handle both formats or just try to match exact string if consistent.
        // For accurate stats, we really need the new Invoice system. 
        // For now, return 0 or try to query if possible. 

        // Let's stick to zeros or basic counts where easy.

        // 3. Plan Expiry Today
        // NextDuedate string match?
        // const expiringTodayCount = await prisma.member.count({ where: { gymId, NextDuedate: todayString } }); // Unreliable date format

        // 4. Collections
        // New Invoice model will solve this.
        let todayCollection = 0;
        try {
            // If Invoice model exists and is populated
            const invoices = await prisma.invoice.findMany({
                where: {
                    gymId,
                    invoiceDate: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                        lt: new Date(new Date().setHours(23, 59, 59, 999))
                    }
                }
            });
            todayCollection = invoices.reduce((sum, inv) => sum + inv.total, 0);
        } catch (e) {
            // Invoice model might not exist or be empty
        }

        return NextResponse.json({
            activeMembers: activeMembersCount,
            todayExpiry: 0, // Placeholder
            todayCollection: todayCollection,
            weekCollection: 0, // Placeholder
            pendingBalance: 0, // Placeholder
            todayRenewal: 0,
            lastMonthRenewal: 0,
            memberPresent: 0
        });

    } catch (error) {
        console.error("Dashboard stats error:", error);
        return NextResponse.json({ message: "Failed to fetch stats" }, { status: 500 });
    }
}
