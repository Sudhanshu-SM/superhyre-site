/** What the agent's tools and actions are called in the chat: past tense once done, present while working. */

export const TOOL_LABEL: Record<string, string> = {
  list_campaigns: "Looked at your campaigns",
  campaign_overview: "Read the campaign",
  find_candidates: "Searched your candidates",
  candidate_profile: "Read a profile",
  campaign_matches: "Went through the people found",
  pipeline: "Checked the pipeline",
  recall_memory: "Recalled what you've told me",
  remember: "Saved that for next time",
  propose_shortlist: "Prepared a shortlist",
  propose_stage_move: "Prepared a stage change",
  propose_find_people: "Prepared a search",
  propose_watch: "Prepared a watch",
  list_schedules: "Looked at what's scheduled",
  propose_schedule: "Prepared something to schedule",
  propose_followup: "Prepared a follow-up",
  cancel_schedule: "Cancelled a scheduled item",
  create_task: "Created a task",
  do_not_contact: "Added someone to do not contact",
};

export const WORKING_LABEL: Record<string, string> = {
  list_campaigns: "Looking at your campaigns",
  campaign_overview: "Reading the campaign",
  find_candidates: "Searching your candidates",
  candidate_profile: "Reading a profile",
  campaign_matches: "Going through the people found",
  pipeline: "Checking the pipeline",
  recall_memory: "Remembering",
  remember: "Saving that",
  list_schedules: "Looking at what's scheduled",
  propose_schedule: "Scheduling",
  propose_followup: "Preparing a follow-up",
  cancel_schedule: "Cancelling a scheduled item",
  create_task: "Creating a task",
  do_not_contact: "Adding to do-not-contact",
};

export const ACTION_LABEL: Record<string, string> = {
  shortlist: "Shortlist",
  move: "Move",
  find_people: "Search",
  start_watch: "Keep sourcing",
  fetch_contacts: "Get contact details",
  remember: "Remember this",
  schedule: "Schedule this",
};
