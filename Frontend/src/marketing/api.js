import axios from "axios";
import { apiOrigin } from "../api/axios";

const publicClient = axios.create({
  baseURL: apiOrigin ? `${apiOrigin}/api/public` : "/api/public",
  timeout: 20000,
  withCredentials: true,
});

export async function fetchSiteConfig() {
  const { data } = await publicClient.get("/site-config");
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
