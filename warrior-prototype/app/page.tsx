import type { Metadata } from "next";
import { WarriorViewer } from "./WarriorViewer";

export const metadata: Metadata = {
  title: "Warrior Study",
  description: "Inspect an original warrior modeled after the auto-rpg concept art.",
};

export default function Home() {
  return <WarriorViewer />;
}
