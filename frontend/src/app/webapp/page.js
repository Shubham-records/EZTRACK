"use client";
import ProtectedRoute from "@/components/ProtectedRoute";
import WebappMain from "@/webapp/webappmain";

export default function WebappPage() {
    return (
        <ProtectedRoute>
            <WebappMain />
        </ProtectedRoute>
    );
}
