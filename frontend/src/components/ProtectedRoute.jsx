"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProtectedRoute({ children }) {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Check if window is defined (client-side)
        if (typeof window !== "undefined") {
            const token = localStorage.getItem("eztracker_jwt_access_control_token");
            if (!token) {
                router.push("/login");
            } else {
                setIsAuthenticated(true);
            }
        }
    }, [router]);

    // Prevent flashing content by only rendering children when authenticated
    if (!isAuthenticated) {
        return null;
    }

    return children;
}
