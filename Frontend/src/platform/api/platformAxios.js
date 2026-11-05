import axios from "axios";
import { apiOrigin } from "../../api/axios";

const platformAxios = axios.create({
    baseURL: apiOrigin ? `${apiOrigin}/api/platform` : "/api/platform",
    headers: {
        "Content-Type": "application/json",
    },
});

platformAxios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("leap_platform_token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

platformAxios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // If on a protected platform route, redirect to platform login
            if (window.location.pathname.startsWith("/platform") && !window.location.pathname.includes("/login")) {
                localStorage.removeItem("leap_platform_token");
                localStorage.removeItem("leap_platform_user");
                window.location.href = "/platform/login";
            }
        }
        return Promise.reject(error);
    }
);

export default platformAxios;
