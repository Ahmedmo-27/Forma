import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { platformGetMe } from "../api/platformEndpoints";

const PlatformAuthContext = createContext(null);

export function PlatformAuthProvider({ children }) {
    const [admin, setAdmin] = useState(() => {
        try {
            const stored = localStorage.getItem("leap_platform_user");
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });
    const [token, setToken] = useState(() => localStorage.getItem("leap_platform_token"));
    const [loading, setLoading] = useState(true);

    const logout = useCallback(() => {
        localStorage.removeItem("leap_platform_token");
        localStorage.removeItem("leap_platform_user");
        setAdmin(null);
        setToken(null);
        window.location.href = "/platform/login";
    }, []);

    const loginSuccess = useCallback((authData) => {
        setToken(authData.token);
        setAdmin(authData.user);
        localStorage.setItem("leap_platform_token", authData.token);
        localStorage.setItem("leap_platform_user", JSON.stringify(authData.user));
    }, []);

    // Refresh current user info and permissions on mount
    useEffect(() => {
        if (!token) {
            setLoading(false);
            return;
        }

        platformGetMe()
            .then((res) => {
                if (res.data?.user) {
                    setAdmin(res.data.user);
                    localStorage.setItem("leap_platform_user", JSON.stringify(res.data.user));
                }
            })
            .catch(() => {
                // Invalidation handled by interceptor
            })
            .finally(() => {
                setLoading(false);
            });
    }, [token]);

    const hasPermission = useCallback(
        (permissionKey) => {
            if (!admin) return false;
            if (admin.role === "super_admin") return true;
            return Array.isArray(admin.permissions) && admin.permissions.includes(permissionKey);
        },
        [admin]
    );

    const value = {
        admin,
        token,
        loading,
        loginSuccess,
        logout,
        hasPermission,
    };

    return <PlatformAuthContext.Provider value={value}>{children}</PlatformAuthContext.Provider>;
}

export function usePlatformAuth() {
    const context = useContext(PlatformAuthContext);
    if (!context) {
        throw new Error("usePlatformAuth must be used within a PlatformAuthProvider");
    }
    return context;
}
