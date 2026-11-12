import axios from "axios";
import { apiOrigin } from "../api/axios";
import { readWwwPreviewToken } from "./previewCookie";

const publicClient = axios.create({
  baseURL: apiOrigin ? `${apiOrigin}/api/public` : "/api/public",
  timeout: 20000,
});

function previewAuthHeaders() {
  const token = readWwwPreviewToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchSiteConfig() {
  const { data } = await publicClient.get("/site-config", {
    headers: previewAuthHeaders(),
  });
  return data;
}

export async function fetchPublicPlans() {
  const { data } = await publicClient.get("/plans");
  return data;
}

export async function submitPublicSignup(payload) {
  const { data } = await publicClient.post("/signup", payload, {
    skipGlobalError: true,
  });
  return data;
}
