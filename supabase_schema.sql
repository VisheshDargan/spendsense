-- Supabase table for Task 4: "Where does my salary go?"
-- Run this in Supabase SQL editor once per project.

create table salary_plans (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  visitor_id text not null,
  input jsonb not null,            -- { takeHome, categories: {...}, note }
  output text not null,            -- Gemini's plan text
  input_tokens int default 0,
  output_tokens int default 0,
  identified_saving int default 0  -- parsed from "Identified saving: ₹X/month"
);

-- No names, emails or health data are ever stored — only a random
-- client-generated visitor_id (see frontend), the numeric sliders, and
-- the model's text output.

-- Row Level Security: keep this table server-only. The service_role key
-- used by the Vercel function bypasses RLS, so the public anon key (if
-- ever exposed) cannot read or write this table.
alter table salary_plans enable row level security;
-- (No policies added for anon/authenticated roles -> table is inaccessible
--  to anyone except requests using the service_role key, i.e. our own function.)
