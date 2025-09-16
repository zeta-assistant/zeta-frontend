// app/login/page.tsx (server component, no cookies/await)
import LoginCard from "./LoginCard";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-100 to-indigo-100 grid place-items-center px-6 py-12">
      <LoginCard />
    </main>
  );
}
