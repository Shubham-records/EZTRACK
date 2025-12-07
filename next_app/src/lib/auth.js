import { jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET_KEY || 'default_secret_key');

export async function verifyAuth(request) {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.split(' ')[1];

    try {
        const { payload } = await jwtVerify(token, SECRET_KEY);
        return payload; // Returns { gymId, username, iat, exp }
    } catch (error) {
        console.error("Token verification failed:", error);
        return null;
    }
}
