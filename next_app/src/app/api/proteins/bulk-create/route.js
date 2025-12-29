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
        const body = await request.json();
        // Support both { stocks: [] } and { data: [] } and just []
        let stocks = body.stocks || body.data || body;

        if (!Array.isArray(stocks)) {
            return NextResponse.json({ message: "Invalid input: expected array of stocks" }, { status: 400 });
        }

        const stocksToCreate = stocks.map(s => ({
            gymId: authPayload.gymId,
            Year: s.Year ? String(s.Year) : null,
            Month: s.Month,
            Brand: s.Brand,
            ProductName: s.ProductName,
            Flavour: s.Flavour,
            Weight: s.Weight ? String(s.Weight) : null,
            Quantity: s.Quantity ? String(s.Quantity) : null,
            MRPPrice: s.MRPPrice ? String(s.MRPPrice) : null,
            LandingPrice: s.LandingPrice ? String(s.LandingPrice) : null,
            TotalPrice: s.TotalPrice ? String(s.TotalPrice) : null,
            Remark: s.Remark
        }));

        const result = await prisma.proteinStock.createMany({
            data: stocksToCreate
        });

        return NextResponse.json({ count: result.count, message: "Protein stocks imported successfully" }, { status: 201 });

    } catch (error) {
        console.error("Bulk create protein error:", error);
        return NextResponse.json({ message: `Failed to import proteins: ${error.message}` }, { status: 500 });
    }
}
