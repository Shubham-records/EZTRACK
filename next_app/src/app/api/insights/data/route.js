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
        // Fetch real data for charts. 
        // For now, we will return the mock structure but populated where possible.
        // Or if empty, return defaults.

        // Example: Member Growth (Last 6 months)
        // Group by createdAt using raw query or js aggregation.

        // Since we want to move fast, let's keep the mock data structure for now 
        // but indicate this endpoint is ready to be hooked up to real logic.
        // We will implement REAL logic for Member Types atleast.

        const strengthCount = await prisma.member.count({ where: { gymId, PlanType: 'Strength' } });
        const cardioCount = await prisma.member.count({ where: { gymId, PlanType: 'Cardio' } });

        const memberTypeData = [
            { name: 'Strength', value: strengthCount },
            { name: 'Cardio', value: cardioCount },
            { name: 'Other', value: await prisma.member.count({ where: { gymId, NOT: { PlanType: { in: ['Strength', 'Cardio'] } } } }) }
        ];

        return NextResponse.json({
            memberGrowthData: [], // Populate later
            memberTypeData,
            activeMonthlyMembersData: [],
            ageGroupData: [],
            paymentModeData: [], // Needs Invoices
            revenueSourceData: [], // Needs Invoices
            expenseData: [], // Needs Expenses model?
            gymMembershipRevenueData: [],
            proteinBusinessRevenueData: [],
            weeklyAttendanceData: [], // Needs Attendance
            dailyAttendanceData: [],
            dayHourlyAttendanceData: [],
            nightHourlyAttendanceData: []
        });

    } catch (error) {
        console.error("Insights data error:", error);
        return NextResponse.json({ message: "Failed to fetch insights" }, { status: 500 });
    }
}
