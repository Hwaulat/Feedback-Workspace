-- ==========================================================
-- SUPABASE MIGRATION: Feedback-Workspace
-- ==========================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Table: feedback_customers
CREATE TABLE IF NOT EXISTS public.feedback_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  pin text,
  pin_hash text UNIQUE,
  active boolean NOT NULL DEFAULT true,
  pin_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Table: feedback_items
CREATE TABLE IF NOT EXISTS public.feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.feedback_customers(id) ON DELETE CASCADE,
  number integer NOT NULL,
  feature text NOT NULL DEFAULT '',
  feedback text NOT NULL,
  detail text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('Bug Report', 'Change Request', 'Complaint')),
  category text NOT NULL CHECK (category IN ('Minor', 'Medium', 'Major')),
  status text NOT NULL CHECK (status IN ('Execution', 'Waiting', 'Execution by notes')),
  activity text NOT NULL CHECK (activity IN ('Done', 'In progress', 'Not started', 'Pending')),
  notes text NOT NULL DEFAULT '',
  report_date date DEFAULT CURRENT_DATE,
  estimated_date date,
  completion_date date,
  needs_review boolean NOT NULL DEFAULT false,
  image text,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  actor text NOT NULL DEFAULT 'Internal team',
  CONSTRAINT feedback_items_customer_number_unique UNIQUE (customer_id, number)
);

CREATE INDEX IF NOT EXISTS idx_feedback_items_customer_deleted ON public.feedback_items(customer_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_feedback_items_activity ON public.feedback_items(activity);
CREATE INDEX IF NOT EXISTS idx_feedback_items_type ON public.feedback_items(type);

-- 4. Table: feedback_history
CREATE TABLE IF NOT EXISTS public.feedback_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.feedback_customers(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.feedback_items(id) ON DELETE CASCADE,
  action text NOT NULL,
  field text NOT NULL DEFAULT '',
  old_value text,
  new_value text,
  actor text NOT NULL DEFAULT 'Loop Team',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_history_created_at ON public.feedback_history(created_at DESC);

-- 5. Table: feedback_imports
CREATE TABLE IF NOT EXISTS public.feedback_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  digest text NOT NULL UNIQUE,
  file_name text NOT NULL,
  actor text NOT NULL,
  row_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Table: feedback_attempts
CREATE TABLE IF NOT EXISTS public.feedback_attempts (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Automated Completion Date & Versioning Trigger
CREATE OR REPLACE FUNCTION public.feedback_update_rules() 
RETURNS trigger 
LANGUAGE plpgsql 
SET search_path = public AS $$ 
BEGIN
  IF TG_OP = 'INSERT' THEN 
    NEW.completion_date := CASE WHEN NEW.activity = 'Done' THEN (now() AT TIME ZONE 'Asia/Jakarta')::date ELSE NULL END;
    IF NEW.report_date IS NULL THEN
      NEW.report_date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
    END IF;
  ELSE
    IF NEW.activity <> 'Done' THEN 
      NEW.completion_date := NULL; 
    ELSIF OLD.activity <> 'Done' THEN 
      NEW.completion_date := (now() AT TIME ZONE 'Asia/Jakarta')::date; 
    ELSE 
      NEW.completion_date := OLD.completion_date; 
    END IF;
    NEW.version := OLD.version + 1; 
    NEW.updated_at := now();
  END IF; 
  RETURN NEW; 
END; 
$$;

DROP TRIGGER IF EXISTS feedback_rules ON public.feedback_items;
CREATE TRIGGER feedback_rules 
BEFORE INSERT OR UPDATE ON public.feedback_items 
FOR EACH ROW EXECUTE FUNCTION public.feedback_update_rules();

-- 8. Audit History Trigger
CREATE OR REPLACE FUNCTION public.feedback_audit() 
RETURNS trigger 
LANGUAGE plpgsql 
SET search_path = public AS $$ 
DECLARE 
  k text; 
  previous jsonb; 
  current_row jsonb; 
BEGIN
  current_row := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN 
    INSERT INTO public.feedback_history(customer_id, item_id, action, actor, new_value) 
    VALUES(NEW.customer_id, NEW.id, 'Created feedback', NEW.actor, NEW.feedback);
  ELSE 
    previous := to_jsonb(OLD); 
    FOR k IN SELECT jsonb_object_keys(current_row) LOOP
      IF k NOT IN ('version', 'updated_at', 'actor') AND current_row->k IS DISTINCT FROM previous->k THEN 
        INSERT INTO public.feedback_history(customer_id, item_id, action, field, old_value, new_value, actor) 
        VALUES(
          NEW.customer_id, 
          NEW.id, 
          CASE WHEN k = 'deleted_at' THEN CASE WHEN NEW.deleted_at IS NULL THEN 'Restored feedback' ELSE 'Deleted feedback' END ELSE 'Updated feedback' END, 
          k, 
          previous->>k, 
          current_row->>k, 
          NEW.actor
        ); 
      END IF; 
    END LOOP; 
  END IF; 
  RETURN NEW; 
END; 
$$;

DROP TRIGGER IF EXISTS feedback_audit_changes ON public.feedback_items;
CREATE TRIGGER feedback_audit_changes 
AFTER INSERT OR UPDATE ON public.feedback_items 
FOR EACH ROW EXECUTE FUNCTION public.feedback_audit();

-- 9. Rate Limit & Failed Attempt Tracker
CREATE OR REPLACE FUNCTION public.feedback_record_failure(attempt_keys text[]) 
RETURNS void 
LANGUAGE plpgsql 
SET search_path = public AS $$ 
DECLARE 
  k text; 
BEGIN 
  FOREACH k IN ARRAY attempt_keys LOOP 
    INSERT INTO public.feedback_attempts(key, attempts, updated_at) 
    VALUES(k, 1, now()) 
    ON CONFLICT(key) DO UPDATE 
    SET attempts = CASE WHEN feedback_attempts.updated_at < now() - interval '15 minutes' THEN 1 ELSE feedback_attempts.attempts + 1 END, 
        locked_until = CASE WHEN (CASE WHEN feedback_attempts.updated_at < now() - interval '15 minutes' THEN 1 ELSE feedback_attempts.attempts + 1 END) >= 5 THEN now() + interval '15 minutes' ELSE NULL END, 
        updated_at = now(); 
  END LOOP; 
END; 
$$;

-- 10. Row Level Security & Permissions
ALTER TABLE public.feedback_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_imports ENABLE ROW LEVEL SECURITY;

-- Grant permissions to service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- Public/Anon policies (enables seamless multi-client access)
DROP POLICY IF EXISTS "Allow service_role full access customers" ON public.feedback_customers;
CREATE POLICY "Allow service_role full access customers" ON public.feedback_customers FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public read customers" ON public.feedback_customers;
CREATE POLICY "Allow public read customers" ON public.feedback_customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow public insert customers" ON public.feedback_customers;
CREATE POLICY "Allow public insert customers" ON public.feedback_customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update customers" ON public.feedback_customers;
CREATE POLICY "Allow public update customers" ON public.feedback_customers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete customers" ON public.feedback_customers;
CREATE POLICY "Allow public delete customers" ON public.feedback_customers FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow service_role full access items" ON public.feedback_items;
CREATE POLICY "Allow service_role full access items" ON public.feedback_items FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public read items" ON public.feedback_items;
CREATE POLICY "Allow public read items" ON public.feedback_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow public insert items" ON public.feedback_items;
CREATE POLICY "Allow public insert items" ON public.feedback_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update items" ON public.feedback_items;
CREATE POLICY "Allow public update items" ON public.feedback_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public delete items" ON public.feedback_items;
CREATE POLICY "Allow public delete items" ON public.feedback_items FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow service_role full access history" ON public.feedback_history;
CREATE POLICY "Allow service_role full access history" ON public.feedback_history FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public read history" ON public.feedback_history;
CREATE POLICY "Allow public read history" ON public.feedback_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow public insert history" ON public.feedback_history;
CREATE POLICY "Allow public insert history" ON public.feedback_history FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access imports" ON public.feedback_imports;
CREATE POLICY "Allow service_role full access imports" ON public.feedback_imports FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public read imports" ON public.feedback_imports;
CREATE POLICY "Allow public read imports" ON public.feedback_imports FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Allow public insert imports" ON public.feedback_imports;
CREATE POLICY "Allow public insert imports" ON public.feedback_imports FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role full access attempts" ON public.feedback_attempts;
CREATE POLICY "Allow service_role full access attempts" ON public.feedback_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public all attempts" ON public.feedback_attempts;
CREATE POLICY "Allow public all attempts" ON public.feedback_attempts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
