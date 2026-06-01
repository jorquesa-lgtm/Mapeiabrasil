import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import AdminAtivar from "./pages/AdminAtivar";
import AdminLeads from "./pages/AdminLeads";
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#040812" }}>
        <div className="w-10 h-10 border-2 border-[#1e3a5f] border-t-[#00e5c8] rounded-full animate-spin" />
      </div>
    );
  }
  if (window.location.pathname === "/admin/ativar") return <AdminAtivar />;
  if (window.location.pathname === "/admin") return <AdminLeads />;
  return session ? <DashboardPage user={session.user} /> : <AuthPage />;
}
