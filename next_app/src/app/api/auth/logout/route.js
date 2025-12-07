import { NextResponse } from 'next/server';

export async function POST(request) {
    // Stateless JWT, so just return success. 
    // Client should clear the token.
    return NextResponse.json({ message: "Logged out successfully!" }, { status: 200 });
}
