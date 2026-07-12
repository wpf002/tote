import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tote — Racing Accounting",
    short_name: "Tote",
    description: "Barn-side capture and penny-exact racing accounting.",
    start_url: "/capture",
    display: "standalone",
    background_color: "#0c110f",
    theme_color: "#0e7c66",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
