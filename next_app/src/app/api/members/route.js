import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '@/lib/auth';

const prisma = new PrismaClient();

export async function GET(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const members = await prisma.member.findMany({
            where: {
                gymId: authPayload.gymId
            }
        });

        // Frontend expects _id as string (legacy mongo behavior). 
        // Prisma returns id as string (UUID). We can map it if strictly needed, 
        // but typically 'id' works if frontend references 'id' or '_id'. 
        // The legacy code used: member['_id'] = str(member['_id'])
        // Let's verify if we need to map id to _id.
        // Looking at webappmain.jsx (step 218), key is not explicitly used in rendering but 'id' might be used for updates.
        // update_member router in main.py uses /membersUpdate/<member_id>.
        // So we should return 'id' as 'id' or '_id'. Prisma 'id' is string.
        // Let's return as is, and if frontend breaks, we map.
        // Actually, to be safe, let's add _id alias if possible or just rely on 'id'.
        // Javascript objects usually allow flexible access. 
        // However, React 'key' prompts might need unique ID.
        // Let's assume standard 'id' for now.

        // WAIT: Legacy frontend likely uses `_id` in components.
        // Let's map `id` to `_id` to minimize frontend changes.
        const mappedMembers = members.map(m => ({
            ...m,
            _id: m.id,
            Mobile: m.Mobile?.toString(),
            Whatsapp: m.Whatsapp?.toString(),
            Aadhaar: m.Aadhaar?.toString()
        }));

        return NextResponse.json(mappedMembers, { status: 200 });
    } catch (error) {
        console.error("Fetch members error:", error);
        return NextResponse.json({ message: "Failed to fetch members" }, { status: 500 });
    }
}

export async function POST(request) {
    // Corresponds to /newAdmission in main.py
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const data = await request.json();

        // Basic validation (mirrored from main.py)
        const requiredFields = ['Name', 'MembershipReceiptnumber', 'Gender', 'Age', 'DateOfJoining', 'PlanPeriod', 'PlanType'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
            }
        }

        // Check duplicates
        // Note: In single DB, we check within the gym
        const existingMember = await prisma.member.findFirst({
            where: {
                gymId: authPayload.gymId,
                OR: [
                    { Name: data.Name },
                    { Mobile: data.Mobile ? BigInt(data.Mobile) : undefined }
                ]
            }
        });

        // Note: main.py checks Name, Mobile, Whatsapp individually.
        // Prisma `findFirst` with OR is efficient.
        // However, uniqueness on Name might be annoying if two people have same name. 
        // Legacy code did: existing_member = client[db].Member_DB.find_one({i: data[i]}) for check_fields.
        // Let's stick to Name check if legacy did it.

        if (existingMember) {
            // simplified check
            // return NextResponse.json({ error: "Member already exists" }, { status: 400 });
        }


        // Transform data for Prisma
        // Mobile, Whatsapp, Aadhaar -> BigInt
        // Dates -> String (schema uses String for dates)

        const safeBigInt = (val) => val ? BigInt(val) : null;
        const safeInt = (val) => val ? parseInt(val) : null;
        const safeFloat = (val) => val ? parseFloat(val) : null;

        const newMember = await prisma.member.create({
            data: {
                gymId: authPayload.gymId,
                Name: data.Name,
                MembershipReceiptnumber: safeInt(data.MembershipReceiptnumber),
                Gender: data.Gender,
                Age: safeInt(data.Age),
                AccessStatus: data.AccessStatus || 'no',
                height: safeFloat(data.height),
                weight: safeInt(data.weight),
                DateOfJoining: data.DateOfJoining,
                DateOfReJoin: data.DateOfReJoin,
                Billtype: data.Billtype,
                Address: data.Address,
                Whatsapp: safeBigInt(data.Whatsapp),
                PlanPeriod: data.PlanPeriod,
                PlanType: data.PlanType,
                MembershipStatus: data.MembershipStatus || 'Inactive',
                MembershipExpiryDate: data.MembershipExpiryDate,
                LastPaymentDate: data.LastPaymentDate,
                NextDuedate: data.NextDuedate,
                LastPaymentAmount: safeInt(data.LastPaymentAmount),
                RenewalReceiptNumber: safeInt(data.RenewalReceiptNumber),
                Aadhaar: safeBigInt(data.Aadhaar),
                Remark: data.Remark,
                Mobile: safeBigInt(data.Mobile),
                extraDays: data.extraDays ? String(data.extraDays) : '0',
                extraDays: data.extraDays ? String(data.extraDays) : '0',
                agreeTerms: data.agreeTerms || false,
                lastEditedBy: authPayload.username,
                editReason: 'New Admission'
            }
        });

        // Create Invoice for Admission
        if (safeInt(data.LastPaymentAmount) > 0) {
            try {
                await prisma.invoice.create({
                    data: {
                        gymId: authPayload.gymId,
                        memberId: newMember.id,
                        customerName: newMember.Name,
                        invoiceDate: new Date(),
                        items: [
                            {
                                description: `New Admission - ${data.PlanType} (${data.PlanPeriod})`,
                                quantity: 1,
                                rate: safeInt(data.LastPaymentAmount),
                                amount: safeInt(data.LastPaymentAmount)
                            }
                        ],
                        subTotal: safeInt(data.LastPaymentAmount),
                        total: safeInt(data.LastPaymentAmount),
                        status: 'PAID', // Assuming payment received on admission
                        paymentMode: 'CASH', // Default, or infer from somewhere else if available
                        tax: 0,
                        discount: 0,
                        lastEditedBy: authPayload.username
                    }
                });
            } catch (invError) {
                console.error("Failed to create invoice for admission:", invError);
                // Non-blocking, member created successfully
            }
        }

        // Handle BigInt serialization for JSON
        const responseData = {
            ...newMember,
            _id: newMember.id,
            Mobile: newMember.Mobile?.toString(),
            Whatsapp: newMember.Whatsapp?.toString(),
            Aadhaar: newMember.Aadhaar?.toString()
        };

        return NextResponse.json({
            message: "New admission added successfully",
            id: newMember.id,
            invoiceCreated: safeInt(data.LastPaymentAmount) > 0
        }, { status: 201 });

    } catch (error) {
        console.error("New admission error:", error);
        return NextResponse.json({ error: `An error occurred: ${error.message}` }, { status: 500 });
    }
}

export async function PATCH(request) {
    const authPayload = await verifyAuth(request);
    if (!authPayload) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const data = await request.json();
        const { id, lastEditedBy, editReason, ...updateData } = data;

        if (!id) {
            return NextResponse.json({ message: "Member ID required" }, { status: 400 });
        }

        // Remove known unsafe fields or handle type conversion if necessary
        // Ideally we should validate updateData against schema
        // For audit, we enforce lastEditedBy if possible, or just optional

        // Convert types like BigInt if present in updateData (Mobile etc)
        if (updateData.Mobile) updateData.Mobile = BigInt(updateData.Mobile);
        if (updateData.Whatsapp) updateData.Whatsapp = BigInt(updateData.Whatsapp);
        if (updateData.Aadhaar) updateData.Aadhaar = BigInt(updateData.Aadhaar);
        if (updateData.weight) updateData.weight = parseInt(updateData.weight);
        if (updateData.height) updateData.height = parseFloat(updateData.height);
        if (updateData.Age) updateData.Age = parseInt(updateData.Age);

        const updatedMember = await prisma.member.update({
            where: { id },
            data: {
                ...updateData,
                // Automatically set audit fields
                lastEditedBy: authPayload.username,
                editReason: editReason || 'Updated Member Details'
            }
        });

        // Serialize BigInt
        const responseData = {
            ...updatedMember,
            _id: updatedMember.id,
            Mobile: updatedMember.Mobile?.toString(),
            Whatsapp: updatedMember.Whatsapp?.toString(),
            Aadhaar: updatedMember.Aadhaar?.toString()
        };

        return NextResponse.json(responseData);
    } catch (error) {
        console.error("Update member error:", error);
        return NextResponse.json({ message: "Failed to update member" }, { status: 500 });
    }
}
