import { Suspense } from "react";
import Client from "./Client";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <Client />
    </Suspense>
  );
}
