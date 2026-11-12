import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

let registered = false;

export function registerMarketingGsap() {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  gsap.defaults({ ease: "power2.out", duration: 0.65 });
  registered = true;
}

export { gsap, ScrollTrigger, useGSAP };
