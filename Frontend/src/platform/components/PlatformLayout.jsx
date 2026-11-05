import { Outlet, Navigate } from "react-router-dom";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import PlatformHeader from "./PlatformHeader";
import PlatformSidebar from "./PlatformSidebar";

export default function PlatformLayout() {
    const { token, loading } = usePlatformAuth();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 font-sans">
                <div className="text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-r-transparent"></div>
                    <p className="mt-3 text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        Verifying Platform Credentials...
                    </p>
                </div>
            </div>
        );
    }

    if (!token) {
        return <Navigate to="/platform/login" replace />;
    }

    return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
            <PlatformHeader />
            <div className="flex flex-1 overflow-hidden">
                <PlatformSidebar />
                <main className="flex-1 overflow-y-auto p-6 md:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
