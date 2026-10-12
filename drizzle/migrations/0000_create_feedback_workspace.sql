CREATE TABLE public.feedback_customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, pin_hash text UNIQUE, active boolean NOT NULL DEFAULT true, pin_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.feedback_customers TO service_role;
ALTER TABLE public.feedback_customers ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.feedback_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL REFERENCES public.feedback_customers(id), number integer NOT NULL, feature text NOT NULL DEFAULT '', feedback text NOT NULL, detail text NOT NULL DEFAULT '', type text NOT NULL CHECK (type IN ('Bug Report','Change Request','Complaint')), category text NOT NULL CHECK (category IN ('Minor','Medium','Major')), status text NOT NULL CHECK (status IN ('Execution','Waiting','Execution by notes')), activity text NOT NULL CHECK (activity IN ('Done','In progress','Pending')), notes text NOT NULL DEFAULT '', estimated_date date, completion_date date, deleted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1, actor text NOT NULL DEFAULT 'Internal team', UNIQUE(customer_id,number));
GRANT ALL ON public.feedback_items TO service_role;
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX feedback_customer_index ON public.feedback_items(customer_id,deleted_at);
CREATE TABLE public.feedback_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES public.feedback_customers(id), item_id uuid REFERENCES public.feedback_items(id), action text NOT NULL, field text NOT NULL DEFAULT '', old_value text, new_value text, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.feedback_history TO service_role;
ALTER TABLE public.feedback_history ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.feedback_attempts (key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, locked_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.feedback_attempts TO service_role;
ALTER TABLE public.feedback_attempts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.feedback_imports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), digest text NOT NULL UNIQUE, file_name text NOT NULL, actor text NOT NULL, row_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.feedback_imports TO service_role;
ALTER TABLE public.feedback_imports ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.feedback_update_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN
IF TG_OP = 'INSERT' THEN NEW.completion_date := CASE WHEN NEW.activity = 'Done' THEN (now() AT TIME ZONE 'Asia/Jakarta')::date ELSE NULL END;
ELSE
IF NEW.activity <> 'Done' THEN NEW.completion_date := NULL; ELSIF OLD.activity <> 'Done' THEN NEW.completion_date := (now() AT TIME ZONE 'Asia/Jakarta')::date; ELSE NEW.completion_date := OLD.completion_date; END IF;
NEW.version := OLD.version + 1; NEW.updated_at := now();
END IF; RETURN NEW; END $$;
CREATE TRIGGER feedback_rules BEFORE INSERT OR UPDATE ON public.feedback_items FOR EACH ROW EXECUTE FUNCTION public.feedback_update_rules();
CREATE OR REPLACE FUNCTION public.feedback_audit() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ DECLARE k text; previous jsonb; current_row jsonb; BEGIN
current_row := to_jsonb(NEW);
IF TG_OP='INSERT' THEN INSERT INTO public.feedback_history(customer_id,item_id,action,actor,new_value) VALUES(NEW.customer_id,NEW.id,'Created feedback',NEW.actor,NEW.feedback);
ELSE previous := to_jsonb(OLD); FOR k IN SELECT jsonb_object_keys(current_row) LOOP
IF k NOT IN ('version','updated_at','actor') AND current_row->k IS DISTINCT FROM previous->k THEN INSERT INTO public.feedback_history(customer_id,item_id,action,field,old_value,new_value,actor) VALUES(NEW.customer_id,NEW.id,CASE WHEN k='deleted_at' THEN CASE WHEN NEW.deleted_at IS NULL THEN 'Restored feedback' ELSE 'Deleted feedback' END ELSE 'Updated feedback' END,k,previous->>k,current_row->>k,NEW.actor); END IF; END LOOP; END IF; RETURN NEW; END $$;
CREATE TRIGGER feedback_audit_changes AFTER INSERT OR UPDATE ON public.feedback_items FOR EACH ROW EXECUTE FUNCTION public.feedback_audit();
CREATE OR REPLACE FUNCTION public.feedback_record_failure(attempt_keys text[]) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$ DECLARE k text; BEGIN FOREACH k IN ARRAY attempt_keys LOOP INSERT INTO public.feedback_attempts(key,attempts,updated_at) VALUES(k,1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN feedback_attempts.updated_at < now()-interval '15 minutes' THEN 1 ELSE feedback_attempts.attempts+1 END, locked_until=CASE WHEN (CASE WHEN feedback_attempts.updated_at < now()-interval '15 minutes' THEN 1 ELSE feedback_attempts.attempts+1 END)>=5 THEN now()+interval '15 minutes' ELSE NULL END,updated_at=now(); END LOOP; END $$;
REVOKE ALL ON FUNCTION public.feedback_record_failure(text[]) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.feedback_record_failure(text[]) TO service_role;