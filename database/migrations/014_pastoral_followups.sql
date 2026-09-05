SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('followups.read_own', 'Visualizar acompanhamentos sob sua responsabilidade'),
  ('followups.read_all', 'Supervisionar acompanhamentos da comunidade'),
  ('followups.manage', 'Criar e atualizar acompanhamentos acessíveis'),
  ('followups.notes_read', 'Visualizar notas compartilhadas dos acompanhamentos'),
  ('followups.notes_manage', 'Criar e remover notas próprias dos acompanhamentos'),
  ('followups.pipeline_manage', 'Administrar etapas e etiquetas de acompanhamento')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

DO $migration$
DECLARE current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    INSERT INTO public.role_permissions (tenant_id, role_id, permission_key)
    SELECT roles.tenant_id, roles.id, additions.permission_key
    FROM public.roles
    CROSS JOIN (VALUES
      ('followups.read_own'), ('followups.read_all'), ('followups.manage'),
      ('followups.notes_read'), ('followups.notes_manage'), ('followups.pipeline_manage')
    ) AS additions(permission_key)
    WHERE roles.key = 'admin' AND roles.is_system
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$migration$;

CREATE TABLE public.followup_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer NOT NULL CHECK (position >= 0),
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followup_stages_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT followup_stages_tenant_name_key UNIQUE (tenant_id, name),
  CONSTRAINT followup_stages_tenant_position_key UNIQUE (tenant_id, position)
);
CREATE INDEX followup_stages_tenant_position_idx ON public.followup_stages (tenant_id, position, id);

CREATE TABLE public.followup_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followup_tags_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT followup_tags_tenant_name_key UNIQUE (tenant_id, name)
);
CREATE INDEX followup_tags_tenant_name_idx ON public.followup_tags (tenant_id, name, id);

CREATE TABLE public.pastoral_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  member_user_id uuid,
  owner_user_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  contact_name text NOT NULL CHECK (length(trim(contact_name)) BETWEEN 2 AND 120),
  contact_address text NOT NULL CHECK (length(trim(contact_address)) BETWEEN 3 AND 180),
  next_action_at timestamptz,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pastoral_followups_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT pastoral_followups_member_tenant_fk FOREIGN KEY (member_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE SET NULL (member_user_id),
  CONSTRAINT pastoral_followups_owner_tenant_fk FOREIGN KEY (owner_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT pastoral_followups_stage_tenant_fk FOREIGN KEY (stage_id, tenant_id)
    REFERENCES public.followup_stages (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT pastoral_followups_creator_tenant_fk FOREIGN KEY (created_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX pastoral_followups_tenant_stage_idx ON public.pastoral_followups (tenant_id, stage_id, updated_at DESC, id);
CREATE INDEX pastoral_followups_tenant_owner_idx ON public.pastoral_followups (tenant_id, owner_user_id, next_action_at, id);

CREATE TABLE public.followup_conversations (
  tenant_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, followup_id, conversation_id),
  CONSTRAINT followup_conversations_conversation_key UNIQUE (tenant_id, conversation_id),
  CONSTRAINT followup_conversations_followup_tenant_fk FOREIGN KEY (followup_id, tenant_id)
    REFERENCES public.pastoral_followups (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT followup_conversations_conversation_tenant_fk FOREIGN KEY (conversation_id, tenant_id)
    REFERENCES public.conversations (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX followup_conversations_tenant_conversation_idx ON public.followup_conversations (tenant_id, conversation_id, followup_id);

CREATE TABLE public.followup_tag_assignments (
  tenant_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, followup_id, tag_id),
  CONSTRAINT followup_tag_assignments_followup_tenant_fk FOREIGN KEY (followup_id, tenant_id)
    REFERENCES public.pastoral_followups (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT followup_tag_assignments_tag_tenant_fk FOREIGN KEY (tag_id, tenant_id)
    REFERENCES public.followup_tags (id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX followup_tag_assignments_tenant_tag_idx ON public.followup_tag_assignments (tenant_id, tag_id, followup_id);

CREATE TABLE public.followup_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('private', 'team')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followup_notes_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT followup_notes_followup_tenant_fk FOREIGN KEY (followup_id, tenant_id)
    REFERENCES public.pastoral_followups (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT followup_notes_author_tenant_fk FOREIGN KEY (author_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX followup_notes_tenant_followup_idx ON public.followup_notes (tenant_id, followup_id, created_at DESC, id);

CREATE TABLE public.followup_stage_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  followup_id uuid NOT NULL,
  from_stage_id uuid,
  to_stage_id uuid NOT NULL,
  changed_by_user_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT followup_stage_changes_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT followup_stage_changes_followup_tenant_fk FOREIGN KEY (followup_id, tenant_id)
    REFERENCES public.pastoral_followups (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT followup_stage_changes_from_tenant_fk FOREIGN KEY (from_stage_id, tenant_id)
    REFERENCES public.followup_stages (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT followup_stage_changes_to_tenant_fk FOREIGN KEY (to_stage_id, tenant_id)
    REFERENCES public.followup_stages (id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT followup_stage_changes_actor_tenant_fk FOREIGN KEY (changed_by_user_id, tenant_id)
    REFERENCES public.users (id, tenant_id) ON DELETE RESTRICT
);
CREATE INDEX followup_stage_changes_tenant_followup_idx ON public.followup_stage_changes (tenant_id, followup_id, changed_at DESC, id);

ALTER TABLE public.followup_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_stages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.followup_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pastoral_followups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.followup_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.followup_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_tag_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.followup_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.followup_stage_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_stage_changes FORCE ROW LEVEL SECURITY;

CREATE POLICY followup_stages_tenant_isolation ON public.followup_stages TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY followup_tags_tenant_isolation ON public.followup_tags TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY pastoral_followups_tenant_isolation ON public.pastoral_followups TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY followup_conversations_tenant_isolation ON public.followup_conversations TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY followup_tag_assignments_tenant_isolation ON public.followup_tag_assignments TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY followup_notes_tenant_isolation ON public.followup_notes TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
CREATE POLICY followup_stage_changes_tenant_isolation ON public.followup_stage_changes TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());

CREATE TRIGGER followup_stages_audit AFTER INSERT OR UPDATE OR DELETE ON public.followup_stages
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER followup_tags_audit AFTER INSERT OR UPDATE OR DELETE ON public.followup_tags
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER pastoral_followups_audit AFTER INSERT OR UPDATE OR DELETE ON public.pastoral_followups
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');
CREATE TRIGGER followup_conversations_audit AFTER INSERT OR UPDATE OR DELETE ON public.followup_conversations
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('followup_id');
CREATE TRIGGER followup_tag_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON public.followup_tag_assignments
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('followup_id');
CREATE TRIGGER followup_notes_audit AFTER INSERT OR UPDATE OR DELETE ON public.followup_notes
FOR EACH ROW EXECUTE FUNCTION app.record_audit_event('id');

REVOKE ALL ON public.followup_stages, public.followup_tags, public.pastoral_followups,
  public.followup_conversations, public.followup_tag_assignments, public.followup_notes,
  public.followup_stage_changes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_stages, public.followup_tags,
  public.pastoral_followups, public.followup_conversations, public.followup_tag_assignments,
  public.followup_notes TO igreja_runtime;
GRANT SELECT, INSERT ON public.followup_stage_changes TO igreja_runtime;

DO $defaults$
DECLARE current_tenant uuid;
BEGIN
  FOR current_tenant IN SELECT tenant_id FROM public.tenant_directory LOOP
    PERFORM set_config('app.tenant_id', current_tenant::text, true);
    INSERT INTO public.followup_stages (tenant_id, name, color, position, is_terminal) VALUES
      (current_tenant, 'Novo contato', '#3B82F6', 0, false),
      (current_tenant, 'Acolhimento', '#D4A94F', 1, false),
      (current_tenant, 'Em acompanhamento', '#7C5CBF', 2, false),
      (current_tenant, 'Integrado', '#378661', 3, true),
      (current_tenant, 'Pausado', '#8A9691', 4, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$defaults$;
