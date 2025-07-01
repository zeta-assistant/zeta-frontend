import { supabase } from "@/lib/supabaseClient";

export async function checkOrCreateUserProject(userId: string) {
  const { data: projects, error: fetchError } = await supabase
    .from("user_projects")
    .select("*")
    .eq("user_id", userId);

  if (fetchError) {
    console.error("⚠️ Fetch error:", fetchError); // Debug
    throw fetchError;
  }

  if (projects && projects.length > 0) {
    console.log("🟢 Project already exists:", projects[0]); // Debug
    return projects[0];
  }

  const { data: newProject, error: insertError } = await supabase
    .from("user_projects")
    .insert([
      {
        user_id: userId,
        name: "New Zeta Project",
        description: "Your personal Zeta assistant is ready.",
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (insertError) {
    console.error("❌ Insert error:", insertError); // Debug
    throw insertError;
  }

  console.log("✅ New project created:", newProject); // Debug
  return newProject;
}