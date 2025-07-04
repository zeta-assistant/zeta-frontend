import { supabase } from "@/lib/supabaseClient";

export async function checkOrCreateUserProject(
  userId: string,
  type: 'zeta' | 'theta' | 'delta' = 'zeta'
) {
  // Check for existing project of this type
  const { data: projects, error: fetchError } = await supabase
    .from("user_projects")
    .select("*")
    .eq("user_id", userId)
    .eq("type", type);

  if (fetchError) {
    console.error("⚠️ Fetch error:", fetchError);
    throw fetchError;
  }

  if (projects && projects.length > 0) {
    console.log("🟢 Project already exists:", projects[0]);
    return projects[0];
  }

  // No existing project → create one
  const { data: newProject, error: insertError } = await supabase
    .from("user_projects")
    .insert([
      {
        user_id: userId,
        name: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Project`,
        type: type,
        description: `Your personal ${type} assistant is ready.`,
        onboarding_complete: false, // make sure this column exists
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (insertError) {
    console.error("❌ Insert error:", insertError);
    throw insertError;
  }

  console.log("✅ New project created:", newProject);
  return newProject;
}