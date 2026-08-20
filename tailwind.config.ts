import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        overheid: {
          blue: "#154273",
          lightblue: "#e6eef5",
        },
      },
    },
  },
  plugins: [],
};

export default config;
