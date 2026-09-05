SET LOCAL ROLE igreja_owner;

INSERT INTO public.permissions (key, description) VALUES
  ('settings.read', 'Visualizar configurações da comunidade'),
  ('settings.manage', 'Alterar configurações e integrações da comunidade')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE public.community_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('identity', 'payment')),
  provider_key text NOT NULL CHECK (provider_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  enabled boolean NOT NULL DEFAULT false,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_integrations_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT community_integrations_provider_key UNIQUE (tenant_id, category, provider_key),
  CONSTRAINT community_integrations_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES public.tenants (id) ON DELETE CASCADE,
  CONSTRAINT community_integrations_configuration_object_check
    CHECK (jsonb_typeof(configuration) = 'object'),
  CONSTRAINT community_integrations_secret_reference_check
    CHECK (secret_reference IS NULL OR secret_reference ~ '^[A-Z][A-Z0-9_]{2,127}$')
);

CREATE INDEX community_integrations_tenant_category_idx
  ON public.community_integrations (tenant_id, category);

ALTER TABLE public.community_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_integrations FORCE ROW LEVEL SECURITY;

CREATE POLICY community_integrations_tenant_isolation
ON public.community_integrations
TO igreja_runtime, igreja_owner
USING (tenant_id = app.current_tenant_id())
WITH CHECK (tenant_id = app.current_tenant_id());

REVOKE ALL ON public.community_integrations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_integrations TO igreja_runtime;
