import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { usePlatformAuth } from "../context/PlatformAuthContext";
import PlatformHeader from "./PlatformHeader";
import PlatformSidebar from "./PlatformSidebar";

export default function PlatformLayout() {
    const { token, loading } = usePlatformAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300 font-sans">
                <div className="text-center">
                    <div className="relative inline-flex items-center justify-center">
                        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500/20 border-t-indigo-500" />
                        <div className="absolute h-5 w-5 rounded-full bg-indigo-500/20 blur-sm" />
                    </div>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Verifying Platform Access...
                    </p>
                </div>
            </div>
        );
    }

    if (!token) {
        return <Navigate to="/platform/login" replace />;
    }

    return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white relative">
            {/* Dot/Grid Pattern Overlay */}
            <div className="pointer-events-none fixed inset-0 z-0" style={{backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.04) 1px, transparent 1px)', backgroundSize: '28px 28px'}} />

            {/* Ambient Background Glow */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-40">
                <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
                <div className="absolute top-1/3 -right-40 h-96 w-96 rounded-full bg-emerald-600/10 blur-3xl" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-64 w-96 rounded-full bg-violet-600/8 blur-3xl" />
            </div>

            {/* Platform Top Header */}
            <PlatformHeader 
                sidebarOpen={sidebarOpen} 
                onToggleSidebar={() => setSidebarOpen(prev => !prev)} 
            />

            <div className="relative z-10 flex flex-1 overflow-hidden">
                {/* Responsive Backdrop for mobile/tablet */}
                {sidebarOpen && (
                    <div 
                        onClick={() => setSidebarOpen(false)}
                        className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm transition-opacity lg:hidden"
                        aria-hidden="true"
                    />
                )}

                {/* Platform Sidebar */}
                <PlatformSidebar 
                    isOpen={sidebarOpen} 
                    onClose={() => setSidebarOpen(false)} 
                />

                {/* Main Content Area */}
                <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
