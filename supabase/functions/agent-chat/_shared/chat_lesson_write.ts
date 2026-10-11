export type PrivateChatLesson = {
  kind: string; scope: string; category: string; title: string;
  what_happened: string; what_to_do_instead: string; signal?: string;
};
export async function writePrivateChatLesson(client:any,userId:string,lesson:PrivateChatLesson,bridge:boolean):Promise<void> {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId)) throw new Error("Verified lesson owner required.");
  const parameters:any={p_kind:lesson.kind,p_scope:lesson.scope,p_category:lesson.category,p_title:lesson.title,
    p_what_happened:lesson.what_happened,p_what_to_do_instead:lesson.what_to_do_instead,p_signal:lesson.signal??""};
  if (bridge) parameters.p_user=userId;
  const result=await client.rpc(bridge?"record_agent_lesson_as":"record_agent_lesson",parameters);
  if(result.error)throw new Error("Private lesson could not be recorded.");
}
export async function notePrivateLessonsApplied(client:any,userId:string,ids:string[],bridge:boolean):Promise<void> {
  const parameters:any={p_ids:ids};
  if(bridge)parameters.p_user=userId;
  const result=await client.rpc(bridge?"agent_lessons_note_applied_as":"agent_lessons_note_applied",parameters);
  if(result.error)throw new Error("Lesson applications could not be recorded.");
}
