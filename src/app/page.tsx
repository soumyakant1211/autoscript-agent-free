import Generator from "@/components/Generator";
import { RequireSession } from "@/components/RequireSession";

export default function Home() {
  return (
    <RequireSession>
      <Generator />
    </RequireSession>
  );
}
